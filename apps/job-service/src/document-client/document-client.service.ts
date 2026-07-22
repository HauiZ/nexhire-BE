import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '@nexhire/infra';
import { ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';
import { AxiosError } from 'axios';
import { Redis } from 'ioredis';
import { firstValueFrom } from 'rxjs';
import { DocumentDownloadResponse } from './interfaces/document-download-response.interface';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

@Injectable()
export class DocumentClientService {
  private readonly logger = new Logger(DocumentClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async createDownloadUrl(documentId: string): Promise<DocumentDownloadResponse> {
    const cacheKey = `job:document-download:${documentId}`;
    const cached = await this.getCachedDownloadUrl(cacheKey);
    if (cached) {
      return cached;
    }

    const baseUrl = this.configService.get<string>('jobService.services.documentStorageService');
    const timeout = this.configService.get<number>('jobService.http.timeoutMs', 5000);
    const internalServiceToken = this.configService.get<string>('jobService.internalServiceToken');

    try {
      const response = await firstValueFrom(
        this.httpService.get<ApiEnvelope<DocumentDownloadResponse>>(
          `${baseUrl}/api/v1/internal/documents/${documentId}/download-url`,
          {
            timeout,
            headers: {
              [HEADERS.INTERNAL_SERVICE_TOKEN]: internalServiceToken,
              [HEADERS.USER_ID]: 'job-service',
              [HEADERS.USER_ROLE]: UserRole.ADMIN,
            },
          },
        ),
      );
      const download = response.data.data;
      await this.cacheDownloadUrl(cacheKey, download);
      return download;
    } catch (error) {
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.warn(`Document download URL resolve failed documentId=${documentId}: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.COMMON.SERVICE_UNAVAILABLE,
        message: 'Document download URL resolve failed',
      });
    }
  }

  private async getCachedDownloadUrl(cacheKey: string): Promise<DocumentDownloadResponse | null> {
    try {
      const cached = await this.redis.get(cacheKey);
      return cached ? (JSON.parse(cached) as DocumentDownloadResponse) : null;
    } catch (error) {
      this.logger.warn(`Redis document cache read failed key=${cacheKey}: ${(error as Error).message}`);
      return null;
    }
  }

  private async cacheDownloadUrl(
    cacheKey: string,
    download: DocumentDownloadResponse,
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
}
