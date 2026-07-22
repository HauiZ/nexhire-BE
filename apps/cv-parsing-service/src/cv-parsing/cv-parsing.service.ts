import { Injectable, Logger } from '@nestjs/common';
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
import { CvParseProvider, CvParseRequestStatus } from './entities/cv-parsing.enum';
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
    const provider = this.resolveProvider();
    const providerVersion = this.resolveProviderVersion(provider);

    const request = await this.parseRequestRepo.save(
      this.parseRequestRepo.create({
        candidateId: dto.candidateId,
        requestedByUserId: dto.requestedByUserId,
        candidateCvId: dto.candidateCvId,
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

    await this.parseRequestRepo.update(result.request.id, {
      status: CvParseRequestStatus.SUCCEEDED,
      errorCode: null,
      errorMessage: null,
    });

    return this.mapParseResult(result.parseResult, true);
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
    await this.candidateClientService.markCvParseFailed({
      candidateId: request.candidateId,
      candidateCvId: request.candidateCvId,
      requestedByUserId: request.requestedByUserId,
      errorMessage,
    });
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
