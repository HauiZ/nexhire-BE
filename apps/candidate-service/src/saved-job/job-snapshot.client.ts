import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ERROR_CODES, HEADERS, JobExperienceLevel, JobStatus, UserRole } from '@nexhire/shared';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface SavedJobSnapshot {
  id: string;
  companyId: string;
  companyName: string | null;
  companyLogoUrl: string | null;
  companyLogoDocumentId: string | null;
  title: string;
  status: JobStatus;
  experienceLevel: JobExperienceLevel;
  location: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  isSalaryVisible: boolean;
  deadline: string | Date | null;
  publishedAt: string | Date | null;
  isPublic: boolean;
}

@Injectable()
export class JobSnapshotClient {
  private readonly logger = new Logger(JobSnapshotClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getSavedSnapshot(jobId: string): Promise<SavedJobSnapshot> {
    const baseUrl = this.configService.get<string>('candidateService.services.jobService');
    const timeout = this.configService.get<number>('candidateService.http.timeoutMs', 30000);
    const internalServiceToken = this.configService.get<string>(
      'candidateService.internalServiceToken',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.get<ApiEnvelope<SavedJobSnapshot>>(
          `${baseUrl}/api/v1/internal/jobs/${jobId}/saved-snapshot`,
          {
            timeout,
            headers: {
              [HEADERS.INTERNAL_SERVICE_TOKEN]: internalServiceToken,
              [HEADERS.USER_ID]: 'candidate-service',
              [HEADERS.USER_ROLE]: UserRole.ADMIN,
            },
          },
        ),
      );
      return response.data.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        throw new NotFoundException({
          code: ERROR_CODES.JOB.JOB_NOT_FOUND,
          message: 'Job was not found',
        });
      }
      if (error instanceof HttpException) {
        throw error;
      }
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(`Job saved snapshot lookup failed jobId=${jobId}: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Job service is unavailable',
      });
    }
  }
}
