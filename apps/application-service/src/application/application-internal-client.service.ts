import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ERROR_CODES, HEADERS, JobStatus, UserRole } from '@nexhire/shared';

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

@Injectable()
export class ApplicationInternalClientService {
  private readonly logger = new Logger(ApplicationInternalClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
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
    return this.getFromService<DocumentDownloadSnapshot>(
      'documentStorageService',
      `/api/v1/internal/documents/${documentId}/download-url`,
    );
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
}
