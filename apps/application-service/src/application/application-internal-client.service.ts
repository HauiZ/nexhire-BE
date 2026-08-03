import { HttpService } from '@nestjs/axios';
import { HttpException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '@nexhire/infra';
import { AxiosError } from 'axios';
import { Redis } from 'ioredis';
import { firstValueFrom } from 'rxjs';
import { ERROR_CODES, HEADERS, JobStatus, ParsedResume, UserRole } from '@nexhire/shared';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface JobApplicationSnapshot {
  id: string;
  companyId: string;
  companyName: string | null;
  companyLogoUrl: string | null;
  companyLogoDocumentId: string | null;
  title: string;
  status: JobStatus;
  deadline: string | null;
  isApplyable: boolean;
}

export interface CandidateApplicationSnapshot {
  candidateId: string;
  candidateUserId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  avatarDocumentId: string | null;
  candidateCvId: string;
  cvDocumentId: string;
  cvTitle: string | null;
  cvParseStatus: string;
}

export interface DocumentDownloadSnapshot {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  expiresInSeconds: number;
}

export interface MatchRequestSnapshot {
  id: string | null;
  applicationId: string | null;
  status: string;
  requestType: string;
}

export interface CvParseResultSnapshot {
  id: string;
  parseRequestId: string;
  candidateId: string;
  candidateCvId: string | null;
  documentId: string;
  normalizedPayload: ParsedResume;
  createdAt: string;
}

export interface CandidateCvSnapshot {
  id: string;
  documentId: string;
  title: string | null;
  isDefault: boolean;
  parseStatus: string;
}

export interface ApplicationMatchResultSnapshot {
  id: string;
  matchRequestId: string | null;
  applicationId: string | null;
  jobId: string;
  candidateId: string;
  candidateCvId: string | null;
  status: 'SUCCEEDED' | 'FAILED';
  totalScore: number;
  matchLevel: string;
  explanation: {
    matchedSkills?: string[];
    missingSkills?: string[];
    recommendation?: string;
    decision?: string;
    priority?: string;
    summary?: string | null;
    nextActions?: string[];
    riskFlags?: string[];
  };
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string | null;
}

@Injectable()
export class ApplicationInternalClientService {
  private readonly logger = new Logger(ApplicationInternalClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getJobApplicationSnapshot(jobId: string): Promise<JobApplicationSnapshot> {
    return this.getFromService<JobApplicationSnapshot>(
      'jobService',
      `/api/v1/internal/jobs/${jobId}/application-snapshot`,
    );
  }

  async getCandidateApplicationSnapshot(
    candidateUserId: string,
    candidateCvId: string,
  ): Promise<CandidateApplicationSnapshot> {
    return this.getFromService<CandidateApplicationSnapshot>(
      'candidateService',
      `/api/v1/internal/candidates/users/${candidateUserId}/cvs/${candidateCvId}/application-snapshot`,
    );
  }

  async getDocumentDownload(documentId: string): Promise<DocumentDownloadSnapshot> {
    const cacheKey = `application:document-download:${documentId}`;
    const cached = await this.getCachedDocumentDownload(cacheKey);
    if (cached) {
      return cached;
    }

    const download = await this.getFromService<DocumentDownloadSnapshot>(
      'documentStorageService',
      `/api/v1/internal/documents/${documentId}/download-url`,
    );
    await this.cacheDocumentDownload(cacheKey, download);
    return download;
  }

  async createApplicationMatchRequest(application: {
    id: string;
    jobId: string;
    candidateId: string;
    candidateUserId: string;
    candidateCvId: string;
    cvDocumentId: string;
    requestedByUserId: string;
    requestType?: 'AUTO_APPLICATION' | 'RECRUITER_MANUAL';
    parsedResume?: ParsedResume;
  }): Promise<MatchRequestSnapshot> {
    return this.postToService<MatchRequestSnapshot>(
      'matchingService',
      `/api/v1/matching/applications/${application.id}/requests`,
      {
        applicationId: application.id,
        jobId: application.jobId,
        candidateId: application.candidateId,
        candidateUserId: application.candidateUserId,
        candidateCvId: application.candidateCvId,
        cvDocumentId: application.cvDocumentId,
        requestedByUserId: application.requestedByUserId,
        requestType: application.requestType ?? 'AUTO_APPLICATION',
        parsedResume: application.parsedResume,
      },
    );
  }

  async requestCandidateCvParse(params: {
    candidateId: string;
    candidateCvId: string;
    requestedByUserId: string;
    force?: boolean;
  }): Promise<CandidateCvSnapshot> {
    return this.postToService<CandidateCvSnapshot>(
      'candidateService',
      `/api/v1/internal/cvs/${params.candidateId}/${params.candidateCvId}/request-parse`,
      {
        requestedByUserId: params.requestedByUserId,
        ...(params.force ? { force: true } : {}),
      },
    );
  }

  async getLatestCvParseResult(candidateCvId: string): Promise<CvParseResultSnapshot> {
    return this.getFromService<CvParseResultSnapshot>(
      'cvParsingService',
      `/api/v1/internal/cv-parsing/cvs/${candidateCvId}/latest-result`,
    );
  }

  async getLatestApplicationMatchResult(
    applicationId: string,
  ): Promise<ApplicationMatchResultSnapshot | null> {
    try {
      return await this.getFromService<ApplicationMatchResultSnapshot>(
        'matchingService',
        `/api/v1/matching/applications/${applicationId}/latest-result`,
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 404) {
        return null;
      }
      throw error;
    }
  }

  private async getCachedDocumentDownload(
    cacheKey: string,
  ): Promise<DocumentDownloadSnapshot | null> {
    try {
      const cached = await this.redis.get(cacheKey);
      return cached ? (JSON.parse(cached) as DocumentDownloadSnapshot) : null;
    } catch (error) {
      this.logger.warn(`Redis document cache read failed key=${cacheKey}: ${(error as Error).message}`);
      return null;
    }
  }

  private async cacheDocumentDownload(
    cacheKey: string,
    download: DocumentDownloadSnapshot,
  ): Promise<void> {
    const ttlSeconds = Math.max(0, download.expiresInSeconds - 60);
    if (ttlSeconds <= 0) {
      return;
    }
    try {
      await this.redis.set(cacheKey, JSON.stringify(download), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Redis document cache write failed key=${cacheKey}: ${(error as Error).message}`);
    }
  }

  private async getFromService<T>(serviceKey: string, path: string): Promise<T> {
    const baseUrl = this.configService.get<string>(`applicationService.services.${serviceKey}`);
    const timeout = this.configService.get<number>('applicationService.http.timeoutMs', 5000);
    const internalServiceToken = this.configService.get<string>(
      'applicationService.internalServiceToken',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.get<ApiEnvelope<T>>(`${baseUrl}${path}`, {
          timeout,
          headers: {
            [HEADERS.INTERNAL_SERVICE_TOKEN]: internalServiceToken,
            [HEADERS.USER_ID]: 'application-service',
            [HEADERS.USER_ROLE]: UserRole.ADMIN,
          },
        }),
      );
      return response.data.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        throw new HttpException(error.response.data, error.response.status);
      }
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(`Internal call to ${serviceKey}${path} failed: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Required upstream service is unavailable',
      });
    }
  }

  private async postToService<T>(
    serviceKey: string,
    path: string,
    body: unknown,
  ): Promise<T> {
    const baseUrl = this.configService.get<string>(`applicationService.services.${serviceKey}`);
    const timeout = this.configService.get<number>('applicationService.http.timeoutMs', 5000);
    const internalServiceToken = this.configService.get<string>(
      'applicationService.internalServiceToken',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post<ApiEnvelope<T>>(`${baseUrl}${path}`, body, {
          timeout,
          headers: {
            [HEADERS.INTERNAL_SERVICE_TOKEN]: internalServiceToken,
            [HEADERS.USER_ID]: 'application-service',
            [HEADERS.USER_ROLE]: UserRole.ADMIN,
          },
        }),
      );
      return response.data.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        throw new HttpException(error.response.data, error.response.status);
      }
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(`Internal POST to ${serviceKey}${path} failed: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Required upstream service is unavailable',
      });
    }
  }
}
