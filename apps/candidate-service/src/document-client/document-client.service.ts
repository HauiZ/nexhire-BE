import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '@nexhire/infra';
import { AxiosError } from 'axios';
import { Redis } from 'ioredis';
import { firstValueFrom } from 'rxjs';

import { AuthUser, ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';

import { CandidateUploadedFile } from './interfaces/candidate-uploaded-file.interface';
import { DocumentDownloadResponse } from './interfaces/document-download-response.interface';
import { UploadedDocumentResponse } from './interfaces/uploaded-document-response.interface';

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

  async uploadCandidateDocument(
    user: AuthUser,
    candidateId: string,
    documentType: 'AVATAR' | 'CV',
    file: CandidateUploadedFile,
  ): Promise<UploadedDocumentResponse> {
    const baseUrl = this.configService.get<string>(
      'candidateService.services.documentStorageService',
    );
    const timeout = this.configService.get<number>('candidateService.http.timeoutMs', 30000);
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );
    form.append('documentType', documentType);
    form.append('ownerType', 'candidate');
    form.append('ownerId', candidateId);

    try {
      const response = await firstValueFrom(
        this.httpService.post<ApiEnvelope<UploadedDocumentResponse>>(
          `${baseUrl}/api/v1/documents/upload`,
          form,
          {
            timeout,
            headers: this.buildIdentityHeaders(user),
          },
        ),
      );
      return response.data.data;
    } catch (error) {
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(`Document storage upload failed: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Document storage upload failed',
      });
    }
  }

  async deleteDocument(documentId: string): Promise<void> {
    const baseUrl = this.configService.get<string>(
      'candidateService.services.documentStorageService',
    );
    const timeout = this.configService.get<number>('candidateService.http.timeoutMs', 30000);
    const internalServiceToken = this.configService.get<string>(
      'candidateService.internalServiceToken',
    );

    try {
      await firstValueFrom(
        this.httpService.delete(`${baseUrl}/api/v1/internal/documents/${documentId}`, {
          timeout,
          headers: {
            [HEADERS.INTERNAL_SERVICE_TOKEN]: internalServiceToken,
            [HEADERS.USER_ID]: 'candidate-service',
            [HEADERS.USER_ROLE]: UserRole.ADMIN,
          },
        }),
      );
    } catch (error) {
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(`Document storage delete failed documentId=${documentId}: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Document storage delete failed',
      });
    }
  }

  async createDownloadUrl(documentId: string): Promise<DocumentDownloadResponse> {
    const cacheKey = `candidate:document-download:${documentId}`;
    const cached = await this.getCachedDownloadUrl(cacheKey);
    if (cached) {
      return cached;
    }

    const baseUrl = this.configService.get<string>(
      'candidateService.services.documentStorageService',
    );
    const timeout = this.configService.get<number>('candidateService.http.timeoutMs', 30000);
    const internalServiceToken = this.configService.get<string>(
      'candidateService.internalServiceToken',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.get<ApiEnvelope<DocumentDownloadResponse>>(
          `${baseUrl}/api/v1/internal/documents/${documentId}/download-url`,
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
      const download = response.data.data;
      await this.cacheDownloadUrl(cacheKey, download);
      return download;
    } catch (error) {
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.warn(`Document download URL resolve failed documentId=${documentId}: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
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

  private buildIdentityHeaders(user: AuthUser): Record<string, string> {
    return {
      [HEADERS.USER_ID]: user.id,
      [HEADERS.USER_ROLE]: user.role ?? UserRole.CANDIDATE,
      ...(user.companyId ? { [HEADERS.COMPANY_ID]: user.companyId } : {}),
    };
  }
}
