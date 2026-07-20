import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser, ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { CompanyUploadedFile } from './interfaces/company-uploaded-file.interface';
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
