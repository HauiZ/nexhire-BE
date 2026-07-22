import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
import { CandidateClientService } from '../candidate-client/candidate-client.service';
import { GeminiResumeParserClient } from '../gemini/gemini-resume-parser.client';
import { ResumeNormalizerService } from '../skima/resume-normalizer.service';
import { SkimaResumeParserClient } from '../skima/skima-resume-parser.client';

@Injectable()
export class CvParsingService {
  private readonly logger = new Logger(CvParsingService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly candidateClientService: CandidateClientService,
    private readonly geminiClient: GeminiResumeParserClient,
    private readonly skimaClient: SkimaResumeParserClient,
    private readonly resumeNormalizer: ResumeNormalizerService,
    @InjectRepository(CvParseRequest)
    private readonly parseRequestRepo: Repository<CvParseRequest>,
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

  private async createQueuedRequest(dto: CreateCvParseRequestDto): Promise<CvParseRequest> {
    const provider = this.resolveProvider();
    const providerVersion = this.resolveProviderVersion(provider);

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
    if (profileApplied) {
      await this.applyParsedResumeToCandidate(result.request, dto.normalizedPayload).catch(
        async (error: unknown) => {
          await this.markParseRequestFailed(
            result.request.id,
            'CANDIDATE.PROFILE_APPLY_FAILED',
            (error as Error).message,
          );
          await this.markCandidateCvParseFailed(result.request, (error as Error).message);
          throw error;
        },
      );
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

    try {
      const request = await this.parseRequestRepo.findOneOrFail({ where: { id: parseRequestId } });
      const { rawPayload, normalizedPayload } = await this.parseWithProvider(
        request.provider,
        documentUrl,
      );
      return this.completeParseRequest(parseRequestId, {
        normalizedPayload,
        rawProviderPayload: rawPayload,
      });
    } catch (error) {
      const request = await this.parseRequestRepo.findOne({ where: { id: parseRequestId } });
      await this.markParseRequestFailed(
        parseRequestId,
        ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        (error as Error).message,
      );
      if (request) {
        await this.markCandidateCvParseFailed(request, (error as Error).message);
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

  private async applyParsedResumeToCandidate(
    request: CvParseRequest,
    normalizedPayload: CompleteCvParseRequestDto['normalizedPayload'],
  ): Promise<void> {
    if (!request.candidateCvId) {
      return;
    }
    await this.candidateClientService.applyParsedResume({
      candidateId: request.candidateId,
      candidateCvId: request.candidateCvId,
      requestedByUserId: request.requestedByUserId,
      parsedResume: normalizedPayload,
    });
  }

  private async markCandidateCvParseFailed(
    request: CvParseRequest,
    errorMessage: string,
  ): Promise<void> {
    if (!request.candidateCvId) {
      return;
    }
    await this.candidateClientService.markCvParseFailed({
      candidateId: request.candidateId,
      candidateCvId: request.candidateCvId,
      requestedByUserId: request.requestedByUserId,
      errorMessage,
    });
  }

  private shouldApplyParsedResume(request: CvParseRequest): boolean {
    return request.context === CvParseContext.PROFILE_UPDATE && Boolean(request.candidateCvId);
  }

  private assertCreateParseRequest(dto: CreateCvParseRequestDto, templateFillEndpoint: boolean): void {
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
  }> {
    if (provider === CvParseProvider.GEMINI) {
      return this.geminiClient.parseResumeFromUrl(documentUrl);
    }

    const rawPayload = await this.skimaClient.parseResumeFromUrl(documentUrl);
    return {
      rawPayload,
      normalizedPayload: this.resumeNormalizer.normalize(rawPayload),
    };
  }

  private resolveProvider(): CvParseProvider {
    const provider = this.configService.get<string>('cvParsingService.parseProvider', 'GEMINI');
    return provider === CvParseProvider.SKIMA ? CvParseProvider.SKIMA : CvParseProvider.GEMINI;
  }

  private resolveProviderVersion(provider: CvParseProvider): string | null {
    if (provider === CvParseProvider.GEMINI) {
      return (
        this.configService.get<string | null>('cvParsingService.gemini.providerVersion') ??
        this.configService.get<string | null>('cvParsingService.gemini.model') ??
        null
      );
    }

    return this.configService.get<string | null>('cvParsingService.skima.providerVersion') ?? null;
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
