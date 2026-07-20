import {
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { AuthUser, ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';
import {
  RecruiterDashboardCompanyDto,
  RecruiterDashboardStatsDto,
  RecruiterDashboardSummaryDto,
  RecruiterDashboardTasksDto,
} from './recruiter-dashboard.dto';

type ServiceKey = 'companyService' | 'jobService' | 'applicationService';

interface ApiEnvelope<T> {
  success: true;
  data: T;
}

interface CompanyResponse {
  id: string;
  status: RecruiterDashboardCompanyDto['status'];
  canPostJobs?: boolean;
  completionPercent?: number;
  submittedAt?: string | null;
  rejectionReason?: string | null;
}

interface JobStatusCounts {
  DRAFT: number;
  PENDING_REVIEW: number;
  NEEDS_REVIEW: number;
  SHOULD_REJECT: number;
  PUBLISHED: number;
  UNPUBLISHED: number;
  REJECTED: number;
  CLOSED: number;
  EXPIRED: number;
}

interface ApplicationStatusCounts {
  SUBMITTED: number;
  OFFERED: number;
  REJECTED: number;
  WITHDRAWN: number;
  CANCELLED: number;
}

interface ApplicationStats {
  total: number;
  byStatus: ApplicationStatusCounts;
  responseRate: number;
}

@Injectable()
export class RecruiterDashboardService {
  private readonly logger = new Logger(RecruiterDashboardService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async getSummary(user?: AuthUser): Promise<RecruiterDashboardSummaryDto> {
    this.assertRecruiter(user);

    const company = await this.getCompany(user);
    if (!company) {
      return {
        company: {
          id: null,
          status: 'NO_COMPANY',
          canPostJobs: false,
          completionPercent: 0,
          submittedAt: null,
          rejectionReason: null,
        },
        stats: this.emptyStats(),
        tasks: { verifyCompany: true, pendingJobs: 0, submittedApplications: 0 },
      };
    }

    const userWithCompany = { ...user, companyId: company.id };
    const [jobCounts, applicationStats] = await Promise.all([
      this.getJobStatusCounts(userWithCompany),
      this.getApplicationStats(userWithCompany),
    ]);
    const pendingJobs = jobCounts.PENDING_REVIEW + jobCounts.NEEDS_REVIEW + jobCounts.SHOULD_REJECT;

    return {
      company: {
        id: company.id,
        status: company.status,
        canPostJobs: company.canPostJobs ?? company.status === 'APPROVED',
        completionPercent: company.completionPercent ?? 0,
        submittedAt: company.submittedAt ?? null,
        rejectionReason: company.rejectionReason ?? null,
      },
      stats: {
        activeJobs: jobCounts.PUBLISHED,
        pendingJobs,
        newApplications: applicationStats.byStatus.SUBMITTED,
        responseRate: applicationStats.responseRate,
        responseRateWindowDays: 6,
      },
      tasks: {
        verifyCompany: company.status !== 'APPROVED',
        pendingJobs,
        submittedApplications: applicationStats.byStatus.SUBMITTED,
      },
    };
  }

  private assertRecruiter(user?: AuthUser): asserts user is AuthUser {
    if (!user) {
      throw new UnauthorizedException({
        code: ERROR_CODES.COMMON.UNAUTHENTICATED,
        message: 'Missing access token',
      });
    }
    if (user.role !== UserRole.RECRUITER) {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'Only recruiters can access recruiter dashboard summary',
      });
    }
  }

  private async getCompany(user: AuthUser): Promise<CompanyResponse | null> {
    try {
      return await this.get<CompanyResponse>('companyService', '/api/v1/companies/me', user);
    } catch (error) {
      if (this.isCompanyNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  private async getJobStatusCounts(user: AuthUser): Promise<JobStatusCounts> {
    return this.get<JobStatusCounts>('jobService', '/api/v1/recruiter/jobs/status-counts', user);
  }

  private async getApplicationStats(user: AuthUser): Promise<ApplicationStats> {
    return this.get<ApplicationStats>(
      'applicationService',
      '/api/v1/recruiter/applications/stats',
      user,
    );
  }

  private async get<T>(service: ServiceKey, path: string, user: AuthUser): Promise<T> {
    const baseUrl = this.config.get<string>(`gateway.services.${service}`);
    try {
      const response = await firstValueFrom(
        this.http.get<ApiEnvelope<T>>(`${baseUrl}${path}`, {
          timeout: 5_000,
          headers: {
            [HEADERS.USER_ID]: user.id,
            [HEADERS.USER_ROLE]: user.role,
            ...(user.companyId ? { [HEADERS.COMPANY_ID]: user.companyId } : {}),
          },
        }),
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        if (!this.isCompanyNotFound(error)) {
          this.logger.warn(
            `Recruiter dashboard upstream returned status=${axiosError.response.status} service=${service} path=${path}`,
          );
        }
        throw this.toHttpException(axiosError);
      }
      this.logger.error(
        `Recruiter dashboard upstream call failed service=${service} path=${path}: ${axiosError.message}`,
      );
      throw new ServiceUnavailableException({
        code: ERROR_CODES.COMMON.SERVICE_UNAVAILABLE,
        message: `${service} is unavailable`,
      });
    }
  }

  private isCompanyNotFound(error: unknown): boolean {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const body = response as { code?: string; error?: { code?: string } };
      return (
        error.getStatus() === 404 &&
        (body.code === ERROR_CODES.COMPANY.NOT_FOUND ||
          body.error?.code === ERROR_CODES.COMPANY.NOT_FOUND)
      );
    }
    const response = (error as AxiosError<{ error?: { code?: string } }>).response;
    return response?.status === 404 && response.data?.error?.code === ERROR_CODES.COMPANY.NOT_FOUND;
  }

  private toHttpException(error: AxiosError): HttpException {
    const status = error.response?.status ?? 503;
    const data = error.response?.data;
    if (typeof data === 'object' && data !== null && 'error' in data) {
      const upstreamError = (data as { error?: { code?: string; message?: string } }).error;
      if (upstreamError?.code || upstreamError?.message) {
        return new HttpException(
          {
            code: upstreamError.code ?? ERROR_CODES.COMMON.INTERNAL_ERROR,
            message: upstreamError.message ?? 'Upstream service error',
          },
          status,
        );
      }
    }
    return new HttpException(data as string | Record<string, unknown>, status);
  }

  private emptyStats(): RecruiterDashboardStatsDto {
    return {
      activeJobs: 0,
      pendingJobs: 0,
      newApplications: 0,
      responseRate: 0,
      responseRateWindowDays: 6,
    };
  }
}
