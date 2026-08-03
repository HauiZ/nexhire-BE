import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { AuthUser, ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';
import { AuthUploadedFile } from './interfaces/auth-uploaded-file.interface';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface UploadedDocumentResponse {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface DocumentDownloadResponse {
  id: string;
  url: string;
  expiresInSeconds: number;
}

@Injectable()
export class AuthDocumentClientService {
  private readonly logger = new Logger(AuthDocumentClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async uploadUserAvatar(
    user: AuthUser,
    file: AuthUploadedFile,
  ): Promise<UploadedDocumentResponse> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );
    form.append('documentType', 'AVATAR');
    form.append('ownerType', 'user');
    form.append('ownerId', user.id);

    try {
      const response = await firstValueFrom(
        this.httpService.post<ApiEnvelope<UploadedDocumentResponse>>(
          `${this.baseUrl}/api/v1/documents/upload`,
          form,
          {
            timeout: this.timeout,
            headers: this.identityHeaders(user),
          },
        ),
      );
      return response.data.data;
    } catch (error) {
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(`Auth avatar upload failed userId=${user.id}: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.COMMON.SERVICE_UNAVAILABLE,
        message: 'Document storage upload failed',
      });
    }
  }

  async createDownloadUrl(documentId: string): Promise<DocumentDownloadResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<ApiEnvelope<DocumentDownloadResponse>>(
          `${this.baseUrl}/api/v1/internal/documents/${documentId}/download-url`,
          {
            timeout: this.timeout,
            headers: this.internalHeaders,
          },
        ),
      );
      return response.data.data;
    } catch (error) {
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.warn(`Auth avatar URL resolve failed documentId=${documentId}: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.COMMON.SERVICE_UNAVAILABLE,
        message: 'Document download URL resolve failed',
      });
    }
  }

  async deleteDocumentBestEffort(documentId: string | null): Promise<void> {
    if (!documentId) {
      return;
    }
    try {
      await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}/api/v1/internal/documents/${documentId}`, {
          timeout: this.timeout,
          headers: this.internalHeaders,
        }),
      );
    } catch (error) {
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.warn(
        `Auth avatar old document delete skipped documentId=${documentId}: ${detail}`,
      );
    }
  }

  private get baseUrl(): string {
    return this.configService.get<string>(
      'authService.services.documentStorageService',
      'http://localhost:3009',
    );
  }

  private get timeout(): number {
    return this.configService.get<number>('authService.http.timeoutMs', 30000);
  }

  private get internalHeaders(): Record<string, string> {
    return {
      [HEADERS.INTERNAL_SERVICE_TOKEN]: this.configService.get<string>(
        'authService.internalServiceToken',
        'dev-internal-service-token',
      ),
      [HEADERS.USER_ID]: 'auth-service',
      [HEADERS.USER_ROLE]: UserRole.ADMIN,
    };
  }

  private identityHeaders(user: AuthUser): Record<string, string> {
    return {
      [HEADERS.USER_ID]: user.id,
      [HEADERS.USER_ROLE]: user.role,
    };
  }
}
