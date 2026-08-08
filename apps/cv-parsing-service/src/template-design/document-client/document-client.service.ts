import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { AuthUser, ERROR_CODES, HEADERS } from '@nexhire/shared';

export interface TemplateSourceFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface UploadedDocument {
  id: string;
  url: string;
  fileName: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/**
 * Client tối thiểu tới document-storage-service.
 * Cùng khuôn với các bản đã có ở candidate-service, company-service, auth-service.
 *
 * PDF mẫu của admin không thuộc ứng viên nào nên gắn ownerType 'user' với
 * ownerId là chính admin, documentType 'OTHER'.
 */
@Injectable()
export class TemplateDesignDocumentClient {
  private readonly logger = new Logger(TemplateDesignDocumentClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async uploadSourcePdf(user: AuthUser, file: TemplateSourceFile): Promise<UploadedDocument> {
    const baseUrl = this.configService.get<string>(
      'cvParsingService.services.documentStorageService',
    );
    const timeout = this.configService.get<number>('cvParsingService.http.timeoutMs', 30000);

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );
    form.append('documentType', 'OTHER');
    form.append('ownerType', 'user');
    form.append('ownerId', user.id);

    try {
      const response = await firstValueFrom(
        this.httpService.post<ApiEnvelope<UploadedDocument>>(
          `${baseUrl}/api/v1/documents/upload`,
          form,
          {
            timeout,
            headers: {
              [HEADERS.USER_ID]: user.id,
              [HEADERS.USER_ROLE]: user.role,
            },
          },
        ),
      );
      return response.data.data;
    } catch (error) {
      this.logger.error(
        `Template source upload failed: ${error instanceof AxiosError ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Document storage is temporarily unavailable',
      });
    }
  }

  /** URL presign hết hạn sau 1h, nên phải xin lại mỗi lần chạy job. */
  async createDownloadUrl(user: AuthUser, documentId: string): Promise<string> {
    const baseUrl = this.configService.get<string>(
      'cvParsingService.services.documentStorageService',
    );
    const timeout = this.configService.get<number>('cvParsingService.http.timeoutMs', 30000);
    const internalServiceToken = this.configService.get<string>(
      'cvParsingService.internalServiceToken',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.get<ApiEnvelope<{ url: string }>>(
          `${baseUrl}/api/v1/internal/documents/${documentId}/download-url`,
          {
            timeout,
            headers: {
              [HEADERS.INTERNAL_SERVICE_TOKEN]: internalServiceToken,
              [HEADERS.USER_ID]: user.id,
              [HEADERS.USER_ROLE]: user.role,
            },
          },
        ),
      );
      return response.data.data.url;
    } catch (error) {
      this.logger.error(
        `Template source download URL failed: ${error instanceof AxiosError ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Source PDF is temporarily unavailable',
      });
    }
  }
}
