import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { CompanyStatus, ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface CompanyFollowSnapshot {
  companyId: string;
  ownerUserId: string;
  companyName: string;
  companyLogoUrl: string | null;
  companyLogoDocumentId: string | null;
  companyStatus: CompanyStatus;
}

@Injectable()
export class CompanySnapshotClient {
  private readonly logger = new Logger(CompanySnapshotClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getPostingSnapshot(companyId: string): Promise<CompanyFollowSnapshot> {
    const baseUrl = this.configService.get<string>('candidateService.services.companyService');
    const timeout = this.configService.get<number>('candidateService.http.timeoutMs', 30000);
    const internalServiceToken = this.configService.get<string>(
      'candidateService.internalServiceToken',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.get<ApiEnvelope<CompanyFollowSnapshot>>(
          `${baseUrl}/api/v1/internal/companies/${companyId}/posting-snapshot`,
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
      return response.data.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        throw new NotFoundException({
          code: ERROR_CODES.COMPANY.NOT_FOUND,
          message: 'Company was not found',
        });
      }
      if (error instanceof HttpException) {
        throw error;
      }
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(`Company snapshot lookup failed companyId=${companyId}: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.COMMON.SERVICE_UNAVAILABLE,
        message: 'Company service is unavailable',
      });
    }
  }
}
