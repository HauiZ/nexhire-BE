import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { AuthUser, ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';
import type { ParsedResume } from '@nexhire/shared';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface ParseRequestResponse {
  id: string;
  candidateId: string;
  candidateCvId: string | null;
  documentId: string;
  status: string;
}

export interface ParseTemplateFillResponse {
  id: string;
  parseRequestId: string;
  candidateId: string;
  candidateCvId: string | null;
  documentId: string;
  normalizedPayload: ParsedResume;
  profileApplied: boolean;
  createdAt: string;
}

@Injectable()
export class CvParsingClientService {
  private readonly logger = new Logger(CvParsingClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async createParseRequest(params: {
    user: AuthUser;
    candidateId: string;
    candidateCvId: string;
    documentId: string;
    documentUrl: string;
  }): Promise<ParseRequestResponse> {
    const baseUrl = this.configService.get<string>('candidateService.services.cvParsingService');
    const timeout = this.configService.get<number>('candidateService.http.timeoutMs', 30000);
    const internalServiceToken = this.configService.get<string>(
      'candidateService.internalServiceToken',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post<ApiEnvelope<ParseRequestResponse>>(
          `${baseUrl}/api/v1/internal/cv-parsing/parse`,
          {
            candidateId: params.candidateId,
            requestedByUserId: params.user.id,
            candidateCvId: params.candidateCvId,
            documentId: params.documentId,
            documentUrl: params.documentUrl,
            context: 'PROFILE_UPDATE',
          },
          {
            timeout,
            headers: {
              ...this.buildIdentityHeaders(params.user),
              [HEADERS.INTERNAL_SERVICE_TOKEN]: internalServiceToken,
            },
          },
        ),
      );
      return response.data.data;
    } catch (error) {
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(
        `CV parsing trigger failed candidateCvId=${params.candidateCvId}: ${detail}`,
      );
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'CV parsing trigger failed',
      });
    }
  }

  async parseTemplateFill(params: {
    user: AuthUser;
    candidateId: string;
    documentId: string;
    documentUrl: string;
  }): Promise<ParseTemplateFillResponse> {
    const baseUrl = this.configService.get<string>('candidateService.services.cvParsingService');
    const timeout = this.configService.get<number>('candidateService.http.timeoutMs', 30000);
    const internalServiceToken = this.configService.get<string>(
      'candidateService.internalServiceToken',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post<ApiEnvelope<ParseTemplateFillResponse>>(
          `${baseUrl}/api/v1/internal/cv-parsing/template-fill`,
          {
            candidateId: params.candidateId,
            requestedByUserId: params.user.id,
            documentId: params.documentId,
            documentUrl: params.documentUrl,
            context: 'TEMPLATE_FILL',
          },
          {
            timeout,
            headers: {
              ...this.buildIdentityHeaders(params.user),
              [HEADERS.INTERNAL_SERVICE_TOKEN]: internalServiceToken,
            },
          },
        ),
      );
      return response.data.data;
    } catch (error) {
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(`Template CV parsing failed candidateId=${params.candidateId}: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Template CV parsing failed',
      });
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
