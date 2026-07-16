import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { AuthUser, ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface ParseRequestResponse {
  id: string;
  candidateId: string;
  candidateCvId: string;
  documentId: string;
  status: string;
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
          `${baseUrl}/api/v1/cv-parsing/parse`,
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

  private buildIdentityHeaders(user: AuthUser): Record<string, string> {
    return {
      [HEADERS.USER_ID]: user.id,
      [HEADERS.USER_ROLE]: user.role ?? UserRole.CANDIDATE,
      ...(user.companyId ? { [HEADERS.COMPANY_ID]: user.companyId } : {}),
    };
  }
}
