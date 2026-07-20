import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser, ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { CompanyUploadedFile } from './interfaces/company-uploaded-file.interface';
import {
  DocumentDownloadResponse,
  DocumentMetadataResponse,
  UploadedDocumentResponse,
} from './interfaces/uploaded-document-response.interface';

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
  ) {}

  async uploadCompanyLogo(
    user: AuthUser,
    companyId: string,
    file: CompanyUploadedFile,
  ): Promise<UploadedDocumentResponse> {
    return this.uploadCompanyImage(user, companyId, file, 'LOGO');
  }

  async uploadCompanyHeroImage(
    user: AuthUser,
    companyId: string,
    file: CompanyUploadedFile,
  ): Promise<UploadedDocumentResponse> {
    return this.uploadCompanyImage(user, companyId, file, 'COMPANY_HERO');
  }

  async getDocumentMetadata(documentId: string): Promise<DocumentMetadataResponse> {
    return this.getInternalDocument<DocumentMetadataResponse>(documentId, 'metadata');
  }

  async getDocumentDownload(documentId: string): Promise<DocumentDownloadResponse> {
    return this.getInternalDocument<DocumentDownloadResponse>(documentId, 'download-url');
  }

  private async getInternalDocument<T>(
    documentId: string,
    action: 'metadata' | 'download-url',
  ): Promise<T> {
    const baseUrl = this.configService.get<string>(
      'companyService.services.documentStorageService',
    );
    const timeout = this.configService.get<number>('companyService.http.timeoutMs', 30000);

    try {
      const internalServiceToken = this.configService.get<string>(
        'companyService.internalServiceToken',
      );
      const response = await firstValueFrom(
        this.httpService.get<ApiEnvelope<T>>(
          `${baseUrl}/api/v1/internal/documents/${documentId}/${action}`,
          {
            timeout,
            headers: {
              [HEADERS.INTERNAL_SERVICE_TOKEN]: internalServiceToken,
              [HEADERS.USER_ID]: 'company-service',
              [HEADERS.USER_ROLE]: UserRole.ADMIN,
            },
          },
        ),
      );
      return response.data.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        throw new NotFoundException({
          code: ERROR_CODES.COMMON.NOT_FOUND,
          message: 'Document not found',
        });
      }
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(
        `Document storage ${action} lookup failed documentId=${documentId}: ${detail}`,
      );
      throw new ServiceUnavailableException({
        code: ERROR_CODES.COMMON.SERVICE_UNAVAILABLE,
        message: 'Document storage lookup failed',
      });
    }
  }

  private async uploadCompanyImage(
    user: AuthUser,
    companyId: string,
    file: CompanyUploadedFile,
    documentType: 'LOGO' | 'COMPANY_HERO',
  ): Promise<UploadedDocumentResponse> {
    const baseUrl = this.configService.get<string>(
      'companyService.services.documentStorageService',
    );
    const timeout = this.configService.get<number>('companyService.http.timeoutMs', 30000);
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );
    form.append('documentType', documentType);
    form.append('ownerType', 'company');
    form.append('ownerId', companyId);

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
      this.logger.error(
        `Document storage company image upload failed type=${documentType}: ${detail}`,
      );
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Document storage upload failed',
      });
    }
  }

  private buildIdentityHeaders(user: AuthUser): Record<string, string> {
    return {
      [HEADERS.USER_ID]: user.id,
      [HEADERS.USER_ROLE]: user.role ?? UserRole.RECRUITER,
      ...(user.companyId ? { [HEADERS.COMPANY_ID]: user.companyId } : {}),
    };
  }
}
