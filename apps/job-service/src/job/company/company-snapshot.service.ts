import { HttpService } from '@nestjs/axios';
import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  AuthUser,
  CompanyStatus,
  CompanyTrustLevel as SharedCompanyTrustLevel,
  ERROR_CODES,
  HEADERS,
  UserRole,
} from '@nexhire/shared';
import { CompanyStatusSnapshot, CompanyTrustLevel } from '../entities/job.enum';

export interface CompanyPermissionSnapshot {
  companyId: string;
  companyName: string | null;
  companyLogoUrl: string | null;
  companyLogoDocumentId: string | null;
  companyStatus: CompanyStatusSnapshot;
  companyTrustLevel: CompanyTrustLevel;
  snapshotAt: Date;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CompanyPostingSnapshotResponse {
  companyId: string;
  companyName: string;
  companyLogoUrl: string | null;
  companyLogoDocumentId?: string | null;
  companyStatus: CompanyStatus;
  companyTrustLevel: SharedCompanyTrustLevel;
  changedAt: string;
}

@Injectable()
export class CompanySnapshotService {
  private readonly logger = new Logger(CompanySnapshotService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getPostingSnapshot(user: AuthUser): Promise<CompanyPermissionSnapshot> {
    if (!user.companyId) {
      throw new ForbiddenException({
        code: ERROR_CODES.JOB.COMPANY_REQUIRED,
        message: 'Recruiter must belong to an approved company to post jobs',
      });
    }

    const snapshot = await this.fetchPostingSnapshot(user.companyId);

    if (snapshot.companyStatus === CompanyStatusSnapshot.SUSPENDED) {
      throw new ForbiddenException({
        code: ERROR_CODES.JOB.COMPANY_SUSPENDED,
        message: 'Suspended companies cannot post jobs',
      });
    }

    if (snapshot.companyStatus !== CompanyStatusSnapshot.APPROVED) {
      throw new ForbiddenException({
        code: ERROR_CODES.JOB.COMPANY_NOT_APPROVED,
        message: 'Company must be approved before posting jobs',
      });
    }

    return snapshot;
  }

  private async fetchPostingSnapshot(companyId: string): Promise<CompanyPermissionSnapshot> {
    const baseUrl = this.configService.get<string>('jobService.services.companyService');
    const timeout = this.configService.get<number>('jobService.http.timeoutMs', 5000);
    const internalServiceToken = this.configService.get<string>('jobService.internalServiceToken');

    try {
      const response = await firstValueFrom(
        this.httpService.get<ApiEnvelope<CompanyPostingSnapshotResponse>>(
          `${baseUrl}/api/v1/internal/companies/${companyId}/posting-snapshot`,
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
      const snapshot = response.data.data;
      return {
        companyId: snapshot.companyId,
        companyName: snapshot.companyName,
        companyLogoUrl: snapshot.companyLogoUrl,
        companyLogoDocumentId: snapshot.companyLogoDocumentId ?? null,
        companyStatus: snapshot.companyStatus as unknown as CompanyStatusSnapshot,
        companyTrustLevel: snapshot.companyTrustLevel as unknown as CompanyTrustLevel,
        snapshotAt: new Date(snapshot.changedAt),
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch company posting snapshot companyId=${companyId}: ${
          (error as Error).message
        }`,
      );
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Company service is unavailable',
      });
    }
  }
}
