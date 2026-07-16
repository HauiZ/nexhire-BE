import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface CvDocumentRetentionResponse {
  documentId: string;
  canDelete: boolean;
  activeApplicationCount: number;
  recentTerminalApplicationCount: number;
  blockingStatus: string | null;
}

@Injectable()
export class ApplicationClientService {
  private readonly logger = new Logger(ApplicationClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getCvDocumentRetention(
    documentId: string,
    terminalBefore: Date,
  ): Promise<CvDocumentRetentionResponse> {
    const baseUrl = this.configService.get<string>('candidateService.services.applicationService');
    const timeout = this.configService.get<number>('candidateService.http.timeoutMs', 30000);
    const internalServiceToken = this.configService.get<string>(
      'candidateService.internalServiceToken',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.get<ApiEnvelope<CvDocumentRetentionResponse>>(
          `${baseUrl}/api/v1/internal/applications/cv-documents/${documentId}/retention`,
          {
            timeout,
            params: { terminalBefore: terminalBefore.toISOString() },
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
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(`Application retention check failed documentId=${documentId}: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Application retention check failed',
      });
    }
  }
}
