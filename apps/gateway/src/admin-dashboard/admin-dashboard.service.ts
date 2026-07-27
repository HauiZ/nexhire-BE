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
import { AdminDashboardOverviewDto } from './admin-dashboard.dto';

type ServiceKey = 'authService' | 'companyService' | 'jobService';

interface ApiEnvelope<T> {
  success: true;
  data: T;
}

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async getOverview(user?: AuthUser): Promise<AdminDashboardOverviewDto> {
    this.assertAdmin(user);
    const [users, companies, jobs] = await Promise.all([
      this.get<AdminDashboardOverviewDto['users']>(
        'authService',
        '/api/v1/admin/users/overview',
        user,
      ),
      this.get<AdminDashboardOverviewDto['companies']>(
        'companyService',
        '/api/v1/admin/companies/overview',
        user,
      ),
      this.get<AdminDashboardOverviewDto['jobs']>(
        'jobService',
        '/api/v1/admin/jobs/overview',
        user,
      ),
    ]);
    return { users, companies, jobs };
  }

  private assertAdmin(user?: AuthUser): asserts user is AuthUser {
    if (!user) {
      throw new UnauthorizedException({
        code: ERROR_CODES.COMMON.UNAUTHENTICATED,
        message: 'Missing access token',
      });
    }
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'Only admins can access admin dashboard overview',
      });
    }
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
          },
        }),
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        this.logger.warn(
          `Admin dashboard upstream returned status=${axiosError.response.status} service=${service} path=${path}`,
        );
        throw this.toHttpException(axiosError);
      }
      this.logger.error(
        `Admin dashboard upstream call failed service=${service} path=${path}: ${axiosError.message}`,
      );
      throw new ServiceUnavailableException({
        code: ERROR_CODES.COMMON.SERVICE_UNAVAILABLE,
        message: `${service} is unavailable`,
      });
    }
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
}
