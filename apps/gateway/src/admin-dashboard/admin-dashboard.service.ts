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
  AdminDashboardCompanyGrowthComparisonDto,
  AdminDashboardCompanyGrowthSummaryDto,
  AdminDashboardGrowthDto,
  AdminDashboardGrowthQueryDto,
  AdminDashboardJobGrowthComparisonDto,
  AdminDashboardJobGrowthSummaryDto,
  AdminDashboardOverviewDto,
  AdminDashboardUserGrowthComparisonDto,
  AdminDashboardUserGrowthSummaryDto,
} from './admin-dashboard.dto';

type ServiceKey = 'authService' | 'companyService' | 'jobService';

interface ApiEnvelope<T> {
  success: true;
  data: T;
}

interface SummaryRange {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
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

  async getGrowth(
    user: AuthUser | undefined,
    query: AdminDashboardGrowthQueryDto,
  ): Promise<AdminDashboardGrowthDto> {
    this.assertAdmin(user);
    const queryString = this.toQueryString(query);
    const [users, companies, jobs] = await Promise.all([
      this.get<AdminDashboardGrowthDto['users']>(
        'authService',
        `/api/v1/admin/users/growth${queryString}`,
        user,
      ),
      this.get<AdminDashboardGrowthDto['companies']>(
        'companyService',
        `/api/v1/admin/companies/growth${queryString}`,
        user,
      ),
      this.get<AdminDashboardGrowthDto['jobs']>(
        'jobService',
        `/api/v1/admin/jobs/growth${queryString}`,
        user,
      ),
    ]);
    return { users, companies, jobs };
  }

  async getUserGrowthSummary(
    user: AuthUser | undefined,
    query: AdminDashboardGrowthQueryDto,
  ): Promise<AdminDashboardUserGrowthSummaryDto> {
    this.assertAdmin(user);
    const range = this.normalizeSummaryRange(query);
    const users = await this.get<AdminDashboardGrowthDto['users']>(
      'authService',
      `/api/v1/admin/users/growth${this.toQueryString(this.toRangeGrowthQuery(range.previousFrom, range.to))}`,
      user,
    );
    const totals = {
      registeredUsers: this.sumPointsInRange(users.points, 'registeredUsers', range.from, range.to),
      candidates: this.sumPointsInRange(users.points, 'candidates', range.from, range.to),
      recruiters: this.sumPointsInRange(users.points, 'recruiters', range.from, range.to),
      admins: this.sumPointsInRange(users.points, 'admins', range.from, range.to),
      bannedUsers: this.sumPointsInRange(users.points, 'bannedUsers', range.from, range.to),
      suspendedUsers: this.sumPointsInRange(users.points, 'suspendedUsers', range.from, range.to),
      archivedUsers: this.sumPointsInRange(users.points, 'archivedUsers', range.from, range.to),
    };
    const previousTotals = {
      registeredUsers: this.sumPointsInRange(
        users.points,
        'registeredUsers',
        range.previousFrom,
        range.previousTo,
      ),
      candidates: this.sumPointsInRange(
        users.points,
        'candidates',
        range.previousFrom,
        range.previousTo,
      ),
      recruiters: this.sumPointsInRange(
        users.points,
        'recruiters',
        range.previousFrom,
        range.previousTo,
      ),
      admins: this.sumPointsInRange(users.points, 'admins', range.previousFrom, range.previousTo),
      bannedUsers: this.sumPointsInRange(
        users.points,
        'bannedUsers',
        range.previousFrom,
        range.previousTo,
      ),
      suspendedUsers: this.sumPointsInRange(
        users.points,
        'suspendedUsers',
        range.previousFrom,
        range.previousTo,
      ),
      archivedUsers: this.sumPointsInRange(
        users.points,
        'archivedUsers',
        range.previousFrom,
        range.previousTo,
      ),
    };
    return {
      from: this.formatDateKey(range.from),
      to: this.formatDateKey(range.to),
      comparisonFrom: this.formatDateKey(range.previousFrom),
      comparisonTo: this.formatDateKey(range.previousTo),
      ...totals,
      growth: this.buildGrowthComparison(
        totals,
        previousTotals,
      ) as AdminDashboardUserGrowthComparisonDto,
    };
  }

  async getCompanyGrowthSummary(
    user: AuthUser | undefined,
    query: AdminDashboardGrowthQueryDto,
  ): Promise<AdminDashboardCompanyGrowthSummaryDto> {
    this.assertAdmin(user);
    const range = this.normalizeSummaryRange(query);
    const companies = await this.get<AdminDashboardGrowthDto['companies']>(
      'companyService',
      `/api/v1/admin/companies/growth${this.toQueryString(
        this.toRangeGrowthQuery(range.previousFrom, range.to),
      )}`,
      user,
    );
    const totals = {
      registeredCompanies: this.sumPointsInRange(
        companies.points,
        'registeredCompanies',
        range.from,
        range.to,
      ),
      approvedCompanies: this.sumPointsInRange(
        companies.points,
        'approvedCompanies',
        range.from,
        range.to,
      ),
      rejectedCompanies: this.sumPointsInRange(
        companies.points,
        'rejectedCompanies',
        range.from,
        range.to,
      ),
      suspendedCompanies: this.sumPointsInRange(
        companies.points,
        'suspendedCompanies',
        range.from,
        range.to,
      ),
      reviewRequestedAgain: this.sumPointsInRange(
        companies.points,
        'reviewRequestedAgain',
        range.from,
        range.to,
      ),
    };
    const previousTotals = {
      registeredCompanies: this.sumPointsInRange(
        companies.points,
        'registeredCompanies',
        range.previousFrom,
        range.previousTo,
      ),
      approvedCompanies: this.sumPointsInRange(
        companies.points,
        'approvedCompanies',
        range.previousFrom,
        range.previousTo,
      ),
      rejectedCompanies: this.sumPointsInRange(
        companies.points,
        'rejectedCompanies',
        range.previousFrom,
        range.previousTo,
      ),
      suspendedCompanies: this.sumPointsInRange(
        companies.points,
        'suspendedCompanies',
        range.previousFrom,
        range.previousTo,
      ),
      reviewRequestedAgain: this.sumPointsInRange(
        companies.points,
        'reviewRequestedAgain',
        range.previousFrom,
        range.previousTo,
      ),
    };
    return {
      from: this.formatDateKey(range.from),
      to: this.formatDateKey(range.to),
      comparisonFrom: this.formatDateKey(range.previousFrom),
      comparisonTo: this.formatDateKey(range.previousTo),
      ...totals,
      growth: this.buildGrowthComparison(
        totals,
        previousTotals,
      ) as AdminDashboardCompanyGrowthComparisonDto,
    };
  }

  async getJobGrowthSummary(
    user: AuthUser | undefined,
    query: AdminDashboardGrowthQueryDto,
  ): Promise<AdminDashboardJobGrowthSummaryDto> {
    this.assertAdmin(user);
    const range = this.normalizeSummaryRange(query);
    const jobs = await this.get<AdminDashboardGrowthDto['jobs']>(
      'jobService',
      `/api/v1/admin/jobs/growth${this.toQueryString(this.toRangeGrowthQuery(range.previousFrom, range.to))}`,
      user,
    );
    const totals = {
      createdJobs: this.sumPointsInRange(jobs.points, 'createdJobs', range.from, range.to),
      publishedJobs: this.sumPointsInRange(jobs.points, 'publishedJobs', range.from, range.to),
      unpublishedJobs: this.sumPointsInRange(jobs.points, 'unpublishedJobs', range.from, range.to),
      closedJobs: this.sumPointsInRange(jobs.points, 'closedJobs', range.from, range.to),
      reviewedJobs: this.sumPointsInRange(jobs.points, 'reviewedJobs', range.from, range.to),
      rejectedJobs: this.sumPointsInRange(jobs.points, 'rejectedJobs', range.from, range.to),
      applicationsSubmitted: this.sumPointsInRange(
        jobs.points,
        'applicationsSubmitted',
        range.from,
        range.to,
      ),
    };
    const previousTotals = {
      createdJobs: this.sumPointsInRange(
        jobs.points,
        'createdJobs',
        range.previousFrom,
        range.previousTo,
      ),
      publishedJobs: this.sumPointsInRange(
        jobs.points,
        'publishedJobs',
        range.previousFrom,
        range.previousTo,
      ),
      unpublishedJobs: this.sumPointsInRange(
        jobs.points,
        'unpublishedJobs',
        range.previousFrom,
        range.previousTo,
      ),
      closedJobs: this.sumPointsInRange(
        jobs.points,
        'closedJobs',
        range.previousFrom,
        range.previousTo,
      ),
      reviewedJobs: this.sumPointsInRange(
        jobs.points,
        'reviewedJobs',
        range.previousFrom,
        range.previousTo,
      ),
      rejectedJobs: this.sumPointsInRange(
        jobs.points,
        'rejectedJobs',
        range.previousFrom,
        range.previousTo,
      ),
      applicationsSubmitted: this.sumPointsInRange(
        jobs.points,
        'applicationsSubmitted',
        range.previousFrom,
        range.previousTo,
      ),
    };
    return {
      from: this.formatDateKey(range.from),
      to: this.formatDateKey(range.to),
      comparisonFrom: this.formatDateKey(range.previousFrom),
      comparisonTo: this.formatDateKey(range.previousTo),
      ...totals,
      growth: this.buildGrowthComparison(
        totals,
        previousTotals,
      ) as AdminDashboardJobGrowthComparisonDto,
    };
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

  private toQueryString(query: AdminDashboardGrowthQueryDto): string {
    const params = new URLSearchParams();
    if (query.from) {
      params.set('from', query.from);
    }
    if (query.to) {
      params.set('to', query.to);
    }
    if (query.bucket) {
      params.set('bucket', query.bucket);
    }
    const value = params.toString();
    return value ? `?${value}` : '';
  }

  private toRangeGrowthQuery(from: Date, to: Date): AdminDashboardGrowthQueryDto {
    return {
      from: this.formatDateKey(from),
      to: this.formatDateKey(to),
      bucket: undefined,
    };
  }

  private sumPoints<TPoint, K extends keyof TPoint>(points: TPoint[], field: K): number {
    return points.reduce((sum, point) => sum + Number(point[field] ?? 0), 0);
  }

  private sumPointsInRange<TPoint extends { bucket: string }, K extends keyof TPoint>(
    points: TPoint[],
    field: K,
    from: Date,
    to: Date,
  ): number {
    return this.sumPoints(
      points.filter((point) => this.isBucketInRange(point.bucket, from, to)),
      field,
    );
  }

  private buildGrowthComparison<TMetrics extends Record<string, number>>(
    current: TMetrics,
    previous: TMetrics,
  ): {
    [K in keyof TMetrics]: { previousValue: number; change: number; percent: number | null };
  } {
    return Object.fromEntries(
      Object.entries(current).map(([key, value]) => {
        const previousValue = previous[key] ?? 0;
        const change = value - previousValue;
        return [
          key,
          {
            previousValue,
            change,
            percent: this.calculateGrowthPercent(value, previousValue),
          },
        ];
      }),
    ) as {
      [K in keyof TMetrics]: { previousValue: number; change: number; percent: number | null };
    };
  }

  private calculateGrowthPercent(current: number, previous: number): number | null {
    if (previous === 0) {
      return current === 0 ? 0 : null;
    }
    return Number((((current - previous) / previous) * 100).toFixed(2));
  }

  private normalizeSummaryRange(query: AdminDashboardGrowthQueryDto): SummaryRange {
    const now = this.startOfUtcDay(new Date());
    const to = query.to ? this.parseDateBoundary(query.to) : now;
    const from = query.from ? this.parseDateBoundary(query.from) : this.addDays(to, -29);

    if (from.getTime() > to.getTime()) {
      throw new HttpException(
        {
          code: ERROR_CODES.COMMON.VALIDATION_FAILED,
          message: 'from must be before or equal to to',
        },
        400,
      );
    }

    const rangeDays = this.diffDays(from, to) + 1;
    const previousTo = this.addDays(from, -1);
    const previousFrom = this.addDays(previousTo, -(rangeDays - 1));

    return { from, to, previousFrom, previousTo };
  }

  private parseDateBoundary(value: string): Date {
    const parsed = new Date(value);
    return this.startOfUtcDay(parsed);
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private diffDays(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
  }

  private formatDateKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private isBucketInRange(bucket: string, from: Date, to: Date): boolean {
    const bucketDate = this.parseDateBoundary(bucket);
    return bucketDate.getTime() >= from.getTime() && bucketDate.getTime() <= to.getTime();
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
