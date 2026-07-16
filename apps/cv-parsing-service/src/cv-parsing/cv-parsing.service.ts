import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { DataSource, Repository } from 'typeorm';

import { ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';

import { CompleteCvParseRequestDto } from './dto/complete-cv-parse-request.dto';
import { CreateCvParseRequestDto } from './dto/create-cv-parse-request.dto';
import { CvParseRequestResponseDto } from './dto/cv-parse-request-response.dto';
import { CvParseResultResponseDto } from './dto/cv-parse-result-response.dto';
import { CvParseRequest } from './entities/cv-parse-request.entity';
import { CvParseResult } from './entities/cv-parse-result.entity';
import { CvParseProvider, CvParseRequestStatus } from './entities/cv-parsing.enum';
import { ResumeNormalizerService } from '../skima/resume-normalizer.service';
import { SkimaResumeParserClient } from '../skima/skima-resume-parser.client';

@Injectable()
export class CvParsingService {
  private readonly logger = new Logger(CvParsingService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly skimaClient: SkimaResumeParserClient,
    private readonly resumeNormalizer: ResumeNormalizerService,
    @InjectRepository(CvParseRequest)
    private readonly parseRequestRepo: Repository<CvParseRequest>,
  ) {}

  async createParseRequest(dto: CreateCvParseRequestDto): Promise<CvParseRequestResponseDto> {
    const providerVersion =
      this.configService.get<string | null>('cvParsingService.skima.providerVersion') ?? null;

    const request = await this.parseRequestRepo.save(
      this.parseRequestRepo.create({
        candidateId: dto.candidateId,
        requestedByUserId: dto.requestedByUserId,
        candidateCvId: dto.candidateCvId,
        documentId: dto.documentId,
        documentUrl: dto.documentUrl ?? null,
        context: dto.context,
        status: CvParseRequestStatus.QUEUED,
        provider: CvParseProvider.SKIMA,
        providerVersion,
        contentHash: null,
        errorCode: null,
        errorMessage: null,
      }),
    );

    if (dto.documentUrl) {
      void this.processWithSkima(request.id, dto.documentUrl).catch((error: unknown) => {
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

  private async processWithSkima(
    parseRequestId: string,
    documentUrl: string,
  ): Promise<CvParseResultResponseDto> {
    await this.parseRequestRepo.update(parseRequestId, {
      status: CvParseRequestStatus.PROCESSING,
      errorCode: null,
      errorMessage: null,
    });

    try {
      const rawPayload = await this.skimaClient.parseResumeFromUrl(documentUrl);
      const normalizedPayload = this.resumeNormalizer.normalize(rawPayload);
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
    const baseUrl = this.configService.get<string>('cvParsingService.services.candidateService');
    const timeout = this.configService.get<number>('cvParsingService.http.timeoutMs', 30000);
    const internalServiceToken = this.configService.get<string>(
      'cvParsingService.internalServiceToken',
    );

    try {
      await firstValueFrom(
        this.httpService.post(
          `${baseUrl}/api/v1/internal/candidates/${request.candidateId}/apply-parsed-resume`,
          {
            candidateCvId: request.candidateCvId,
            parsedResume: normalizedPayload,
          },
          {
            timeout,
            headers: {
              [HEADERS.USER_ID]: request.requestedByUserId,
              [HEADERS.USER_ROLE]: UserRole.CANDIDATE,
              [HEADERS.INTERNAL_SERVICE_TOKEN]: internalServiceToken,
            },
          },
        ),
      );
    } catch (error) {
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: `Failed to apply parsed resume to candidate profile: ${(error as Error).message}`,
      });
    }
  }

  private async markCandidateCvParseFailed(
    request: CvParseRequest,
    errorMessage: string,
  ): Promise<void> {
    const baseUrl = this.configService.get<string>('cvParsingService.services.candidateService');
    const timeout = this.configService.get<number>('cvParsingService.http.timeoutMs', 30000);
    const internalServiceToken = this.configService.get<string>(
      'cvParsingService.internalServiceToken',
    );

    try {
      await firstValueFrom(
        this.httpService.post(
          `${baseUrl}/api/v1/internal/candidates/${request.candidateId}/cvs/${request.candidateCvId}/parse-failed`,
          { errorMessage },
          {
            timeout,
            headers: {
              [HEADERS.USER_ID]: request.requestedByUserId,
              [HEADERS.USER_ROLE]: UserRole.CANDIDATE,
              [HEADERS.INTERNAL_SERVICE_TOKEN]: internalServiceToken,
            },
          },
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to mark candidate CV parse failed for candidateCvId=${request.candidateCvId}: ${
          (error as Error).message
        }`,
      );
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
    return this.configService.get<boolean>('cvParsingService.skima.persistRawPayload', false);
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
