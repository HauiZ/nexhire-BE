import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ERROR_CODES } from '@nexhire/shared';

import { CompleteCvParseRequestDto } from './dto/complete-cv-parse-request.dto';
import { CreateCvParseRequestDto } from './dto/create-cv-parse-request.dto';
import { CvParseRequestResponseDto } from './dto/cv-parse-request-response.dto';
import { CvParseResultResponseDto } from './dto/cv-parse-result-response.dto';
import { CvParseRequest } from './entities/cv-parse-request.entity';
import { CvParseResult } from './entities/cv-parse-result.entity';
import { CvParseContext, CvParseProvider, CvParseRequestStatus } from './entities/cv-parsing.enum';
import { CvParseEventPublisher } from './events/cv-parse-event.publisher';
import { AiManagementService, AiUsageTokens } from '../ai-management/ai-management.service';
import { GeminiResumeParserClient } from '../gemini/gemini-resume-parser.client';
import { OpenAiResumeParserClient } from '../openai/openai-resume-parser.client';

export interface CvUploadedEventPayload {
  candidateId: string;
  candidateUserId: string;
  candidateCvId: string;
  documentId: string;
  documentUrl: string;
  context:
    | CvParseContext.PROFILE_UPDATE
    | CvParseContext.MATCHING_APPLICATION
    | 'PROFILE_UPDATE'
    | 'MATCHING_APPLICATION';
  uploadedAt?: string;
}

@Injectable()
export class CvParsingService {
  private readonly logger = new Logger(CvParsingService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly aiManagementService: AiManagementService,
    private readonly cvParseEventPublisher: CvParseEventPublisher,
    private readonly geminiClient: GeminiResumeParserClient,
    private readonly openAiClient: OpenAiResumeParserClient,
    @InjectRepository(CvParseRequest)
    private readonly parseRequestRepo: Repository<CvParseRequest>,
    @InjectRepository(CvParseResult)
    private readonly parseResultRepo: Repository<CvParseResult>,
  ) {}

  async createParseRequest(dto: CreateCvParseRequestDto): Promise<CvParseRequestResponseDto> {
    this.assertCreateParseRequest(dto, false);
    const request = await this.createQueuedRequest(dto);

    if (dto.documentUrl) {
      void this.processWithProvider(request.id, dto.documentUrl).catch((error: unknown) => {
        this.logger.error(
          `Failed to process CV parse request ${request.id}: ${(error as Error).message}`,
        );
      });
    }

    const updatedRequest = await this.parseRequestRepo.findOneOrFail({
      where: { id: request.id },
    });
    return this.mapParseRequest(updatedRequest);
  }

  async processUploadedCv(payload: CvUploadedEventPayload): Promise<void> {
    const request = await this.createQueuedRequest({
      candidateId: payload.candidateId,
      requestedByUserId: payload.candidateUserId,
      candidateCvId: payload.candidateCvId,
      documentId: payload.documentId,
      documentUrl: payload.documentUrl,
      context: payload.context as CvParseContext,
    });

    await this.processWithProvider(request.id, payload.documentUrl);
  }

  async parseTemplateFill(dto: CreateCvParseRequestDto): Promise<CvParseResultResponseDto> {
    this.assertCreateParseRequest(dto, true);
    if (!dto.documentUrl) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'documentUrl is required for template CV parsing',
      });
    }

    const request = await this.createQueuedRequest({
      ...dto,
      context: CvParseContext.TEMPLATE_FILL,
      candidateCvId: dto.candidateCvId ?? undefined,
    });
    return this.processWithProvider(request.id, dto.documentUrl);
  }

  async getLatestResultByCandidateCv(candidateCvId: string): Promise<CvParseResultResponseDto> {
    const result = await this.parseResultRepo.findOne({
      where: { candidateCvId },
      order: { createdAt: 'DESC' },
    });
    if (!result) {
      throw new NotFoundException({
        code: ERROR_CODES.COMMON.NOT_FOUND,
        message: 'Parsed CV result not found',
      });
    }
    return this.mapParseResult(result, true);
  }

  private async createQueuedRequest(dto: CreateCvParseRequestDto): Promise<CvParseRequest> {
    const runtimeConfig = await this.aiManagementService.getRuntimeConfig();
    const provider = runtimeConfig.activeProvider;
    const providerVersion = this.resolveProviderVersion(provider, runtimeConfig);

    return this.parseRequestRepo.save(
      this.parseRequestRepo.create({
        candidateId: dto.candidateId,
        requestedByUserId: dto.requestedByUserId,
        candidateCvId: dto.candidateCvId ?? null,
        documentId: dto.documentId,
        documentUrl: dto.documentUrl ?? null,
        context: dto.context,
        status: CvParseRequestStatus.QUEUED,
        provider,
        providerVersion,
        contentHash: null,
        errorCode: null,
        errorMessage: null,
      }),
    );
  }

  async completeParseRequest(
    parseRequestId: string,
    dto: CompleteCvParseRequestDto,
  ): Promise<CvParseResultResponseDto> {
    const result = await this.dataSource.transaction(async (manager) => {
      const request = await manager.findOneOrFail(CvParseRequest, {
        where: { id: parseRequestId },
      });

      const existingResult = await manager.findOne(CvParseResult, {
        where: { parseRequestId: request.id },
      });
      const parseResult =
        existingResult ??
        (await manager.save(
          CvParseResult,
          manager.create(CvParseResult, {
            parseRequestId: request.id,
            candidateId: request.candidateId,
            candidateCvId: request.candidateCvId,
            documentId: request.documentId,
            provider: request.provider,
            providerVersion: request.providerVersion,
            normalizedPayload: dto.normalizedPayload,
            rawProviderPayload: this.shouldPersistRawPayload()
              ? (dto.rawProviderPayload ?? null)
              : null,
            confidence: dto.confidence ?? null,
          }),
        ));

      return { request, parseResult };
    });

    const profileApplied = this.shouldApplyParsedResume(result.request);
    if (this.shouldPublishParsedResume(result.request)) {
      await this.publishParsedResume(result.request, dto.normalizedPayload);
    }

    await this.parseRequestRepo.update(result.request.id, {
      status: CvParseRequestStatus.SUCCEEDED,
      errorCode: null,
      errorMessage: null,
    });

    return this.mapParseResult(result.parseResult, profileApplied);
  }

  private async processWithProvider(
    parseRequestId: string,
    documentUrl: string,
  ): Promise<CvParseResultResponseDto> {
    await this.parseRequestRepo.update(parseRequestId, {
      status: CvParseRequestStatus.PROCESSING,
      errorCode: null,
      errorMessage: null,
    });

    const request = await this.parseRequestRepo.findOneOrFail({ where: { id: parseRequestId } });
    const startedAt = Date.now();
    let providerResult: Awaited<ReturnType<CvParsingService['parseWithProvider']>>;

    try {
      providerResult = await this.parseWithProvider(request.provider, documentUrl);
    } catch (error) {
      await this.aiManagementService.recordUsage({
        parseRequestId: request.id,
        candidateId: request.candidateId,
        candidateCvId: request.candidateCvId,
        context: request.context,
        provider: request.provider,
        model: request.providerVersion ?? request.provider,
        status: 'FAILED',
        latencyMs: Date.now() - startedAt,
        errorCode: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        errorMessage: (error as Error).message,
      });
      await this.markParseRequestFailed(
        parseRequestId,
        ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        (error as Error).message,
      );
      if (request.candidateCvId) {
        await this.publishCvParseFailed(request, (error as Error).message);
      }
      throw error;
    }

    await this.aiManagementService.recordUsage({
      parseRequestId: request.id,
      candidateId: request.candidateId,
      candidateCvId: request.candidateCvId,
      context: request.context,
      provider: request.provider,
      model: request.providerVersion ?? request.provider,
      status: 'SUCCEEDED',
      latencyMs: Date.now() - startedAt,
      tokens: providerResult.usage,
    });

    try {
      return await this.completeParseRequest(parseRequestId, {
        normalizedPayload: providerResult.normalizedPayload,
        rawProviderPayload: providerResult.rawPayload,
      });
    } catch (error) {
      await this.markParseRequestFailed(
        parseRequestId,
        ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        (error as Error).message,
      );
      if (request.candidateCvId) {
        await this.publishCvParseFailed(request, (error as Error).message);
      }
      throw error;
    }
  }

  private mapParseRequest(request: CvParseRequest): CvParseRequestResponseDto {
    return {
      id: request.id,
      candidateId: request.candidateId,
      requestedByUserId: request.requestedByUserId,
      candidateCvId: request.candidateCvId,
      documentId: request.documentId,
      context: request.context,
      status: request.status,
      provider: request.provider,
      providerVersion: request.providerVersion,
      createdAt: request.createdAt,
    };
  }

  private async publishParsedResume(
    request: CvParseRequest,
    normalizedPayload: CompleteCvParseRequestDto['normalizedPayload'],
  ): Promise<void> {
    if (!request.candidateCvId) {
      return;
    }
    await this.cvParseEventPublisher.publishCvParsed({
      parseRequestId: request.id,
      candidateId: request.candidateId,
      candidateUserId: request.requestedByUserId,
      candidateCvId: request.candidateCvId,
      documentId: request.documentId,
      context: request.context,
      normalizedPayload,
      parsedAt: new Date().toISOString(),
    });
  }

  private async publishCvParseFailed(request: CvParseRequest, errorMessage: string): Promise<void> {
    if (!request.candidateCvId) {
      return;
    }
    await this.cvParseEventPublisher.publishCvParseFailed({
      parseRequestId: request.id,
      candidateId: request.candidateId,
      candidateUserId: request.requestedByUserId,
      candidateCvId: request.candidateCvId,
      documentId: request.documentId,
      context: request.context,
      errorMessage,
      failedAt: new Date().toISOString(),
    });
  }

  private shouldApplyParsedResume(request: CvParseRequest): boolean {
    return request.context === CvParseContext.PROFILE_UPDATE && Boolean(request.candidateCvId);
  }

  private shouldPublishParsedResume(request: CvParseRequest): boolean {
    return (
      Boolean(request.candidateCvId) &&
      [CvParseContext.PROFILE_UPDATE, CvParseContext.MATCHING_APPLICATION].includes(request.context)
    );
  }

  private assertCreateParseRequest(
    dto: CreateCvParseRequestDto,
    templateFillEndpoint: boolean,
  ): void {
    if (dto.context === CvParseContext.PROFILE_UPDATE && !dto.candidateCvId) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'candidateCvId is required for PROFILE_UPDATE CV parsing',
      });
    }

    if (!templateFillEndpoint && dto.context === CvParseContext.TEMPLATE_FILL) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'Use /internal/cv-parsing/template-fill for TEMPLATE_FILL parsing',
      });
    }
  }

  private async markParseRequestFailed(
    parseRequestId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    await this.parseRequestRepo.update(parseRequestId, {
      status: CvParseRequestStatus.FAILED,
      errorCode,
      errorMessage,
    });
  }

  private shouldPersistRawPayload(): boolean {
    return this.configService.get<boolean>('cvParsingService.persistRawPayload', false);
  }

  private async parseWithProvider(
    provider: CvParseProvider,
    documentUrl: string,
  ): Promise<{
    rawPayload: Record<string, unknown>;
    normalizedPayload: CompleteCvParseRequestDto['normalizedPayload'];
    usage?: AiUsageTokens;
  }> {
    if (provider === CvParseProvider.GEMINI) {
      return this.geminiClient.parseResumeFromUrl(documentUrl);
    }

    return this.openAiClient.parseResumeFromUrl(documentUrl);
  }

  private resolveProviderVersion(
    provider: CvParseProvider,
    runtimeConfig: Awaited<ReturnType<AiManagementService['getRuntimeConfig']>>,
  ): string | null {
    if (provider === CvParseProvider.GEMINI) {
      return runtimeConfig.geminiModel;
    }

    return runtimeConfig.openAiModel;
  }

  private mapParseResult(result: CvParseResult, profileApplied: boolean): CvParseResultResponseDto {
    return {
      id: result.id,
      parseRequestId: result.parseRequestId,
      candidateId: result.candidateId,
      candidateCvId: result.candidateCvId,
      documentId: result.documentId,
      provider: result.provider,
      providerVersion: result.providerVersion,
      normalizedPayload: result.normalizedPayload,
      profileApplied,
      createdAt: result.createdAt,
    };
  }
}
