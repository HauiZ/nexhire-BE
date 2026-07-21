import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { DocumentDownloadResponse } from './interfaces/document-download-response.interface';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

@Injectable()
export class DocumentClientService {
  private readonly logger = new Logger(DocumentClientService.name);
  private readonly downloadUrlCache = new Map<
    string,
    { value: DocumentDownloadResponse; expiresAt: number }
  >();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async createDownloadUrl(documentId: string): Promise<DocumentDownloadResponse> {
    const cached = this.downloadUrlCache.get(documentId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
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
      this.cacheDownloadUrl(documentId, download);
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

  private cacheDownloadUrl(documentId: string, download: DocumentDownloadResponse): void {
    const ttlMs = Math.max(0, (download.expiresInSeconds - 60) * 1000);
    if (ttlMs <= 0) {
      return;
    }
    this.downloadUrlCache.set(documentId, {
      value: download,
      expiresAt: Date.now() + ttlMs,
    });
  }
}
