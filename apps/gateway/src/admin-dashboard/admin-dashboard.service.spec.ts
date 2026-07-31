import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import { of } from 'rxjs';
import { UserRole } from '@nexhire/shared';
import { AdminDashboardService } from './admin-dashboard.service';

function response<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as AxiosResponse<T>['config'],
  };
}

describe('AdminDashboardService', () => {
  const http = { get: jest.fn() };
  const config = { get: jest.fn() };
  const admin = { id: 'admin-1', role: UserRole.ADMIN };
  let service: AdminDashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        'gateway.services.authService': 'http://auth-service:3001',
        'gateway.services.companyService': 'http://company-service:3003',
        'gateway.services.jobService': 'http://job-service:3004',
      };
      return values[key];
    });
    service = new AdminDashboardService(
      http as unknown as HttpService,
      config as unknown as ConfigService,
    );
  });

  it('aggregates admin overview from auth, company, and job services', async () => {
    http.get
      .mockReturnValueOnce(
        of(
          response({
            success: true,
            data: {
              total: 10,
              byStatus: { ACTIVE: 8 },
              byRole: { CANDIDATE: 6, RECRUITER: 3, ADMIN: 1 },
              emailVerified: 9,
              emailUnverified: 1,
            },
          }),
        ),
      )
      .mockReturnValueOnce(
        of(
          response({
            success: true,
            data: {
              total: 4,
              byStatus: { PENDING: 1, APPROVED: 2, REJECTED: 1, SUSPENDED: 0 },
              byTrustLevel: { LOW: 1, MEDIUM: 2, HIGH: 1 },
              pendingReviewAgain: 1,
              rejectedBefore: 2,
            },
          }),
        ),
      )
      .mockReturnValueOnce(
        of(
          response({
            success: true,
            data: {
              totalJobs: 20,
              jobsByStatus: { PUBLISHED: 12 },
              jobsWaitingReview: 3,
              publishedJobs: 12,
              unpublishedJobs: 2,
              closedJobs: 1,
              totalRevisions: 5,
              revisionsByStatus: { NEEDS_REVIEW: 2 },
              revisionsWaitingReview: 2,
            },
          }),
        ),
      );

    const result = await service.getOverview(admin);

    expect(result.users.total).toBe(10);
    expect(result.companies.pendingReviewAgain).toBe(1);
    expect(result.jobs.jobsWaitingReview).toBe(3);
    expect(http.get).toHaveBeenNthCalledWith(
      1,
      'http://auth-service:3001/api/v1/admin/users/overview',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-user-role': UserRole.ADMIN }),
      }),
    );
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      'http://company-service:3003/api/v1/admin/companies/overview',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-user-role': UserRole.ADMIN }),
      }),
    );
  });

  it('aggregates admin growth charts and forwards range query', async () => {
    const growthPayload = {
      from: '2026-07-01',
      to: '2026-07-31',
      bucket: 'day',
      points: [{ bucket: '2026-07-01' }],
    };
    http.get
      .mockReturnValueOnce(of(response({ success: true, data: growthPayload })))
      .mockReturnValueOnce(of(response({ success: true, data: growthPayload })))
      .mockReturnValueOnce(of(response({ success: true, data: growthPayload })));

    const result = await service.getGrowth(admin, {
      from: '2026-07-01',
      to: '2026-07-31',
      bucket: 'day' as never,
    });

    expect(result.users.points).toHaveLength(1);
    expect(http.get).toHaveBeenNthCalledWith(
      1,
      'http://auth-service:3001/api/v1/admin/users/growth?from=2026-07-01&to=2026-07-31&bucket=day',
      expect.any(Object),
    );
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      'http://company-service:3003/api/v1/admin/companies/growth?from=2026-07-01&to=2026-07-31&bucket=day',
      expect.any(Object),
    );
    expect(http.get).toHaveBeenNthCalledWith(
      3,
      'http://job-service:3004/api/v1/admin/jobs/growth?from=2026-07-01&to=2026-07-31&bucket=day',
      expect.any(Object),
    );
  });

  it('returns user growth summary from only auth service', async () => {
    http.get.mockReturnValueOnce(
      of(
        response({
          success: true,
          data: {
            from: '2026-06-28',
            to: '2026-07-03',
            bucket: 'day',
            points: [
              {
                bucket: '2026-06-28',
                registeredUsers: 4,
                candidates: 2,
                recruiters: 2,
                admins: 0,
                bannedUsers: 0,
                suspendedUsers: 0,
                archivedUsers: 0,
              },
              {
                bucket: '2026-07-01',
                registeredUsers: 2,
                candidates: 1,
                recruiters: 1,
                admins: 0,
                bannedUsers: 0,
                suspendedUsers: 1,
                archivedUsers: 0,
              },
              {
                bucket: '2026-07-02',
                registeredUsers: 3,
                candidates: 2,
                recruiters: 1,
                admins: 0,
                bannedUsers: 1,
                suspendedUsers: 0,
                archivedUsers: 0,
              },
            ],
          },
        }),
      ),
    );

    const result = await service.getUserGrowthSummary(admin, {
      from: '2026-07-01',
      to: '2026-07-03',
    });

    expect(result.registeredUsers).toBe(5);
    expect(result.candidates).toBe(3);
    expect(result.recruiters).toBe(2);
    expect(result.suspendedUsers).toBe(1);
    expect(result.comparisonFrom).toBe('2026-06-28');
    expect(result.comparisonTo).toBe('2026-06-30');
    expect(result.growth.registeredUsers.previousValue).toBe(4);
    expect(result.growth.registeredUsers.change).toBe(1);
    expect(result.growth.registeredUsers.percent).toBe(25);
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith(
      'http://auth-service:3001/api/v1/admin/users/growth?from=2026-06-28&to=2026-07-03',
      expect.any(Object),
    );
  });

  it('returns company growth summary from only company service', async () => {
    http.get.mockReturnValueOnce(
      of(
        response({
          success: true,
          data: {
            from: '2026-06-28',
            to: '2026-07-03',
            bucket: 'day',
            points: [
              {
                bucket: '2026-06-28',
                registeredCompanies: 0,
                approvedCompanies: 0,
                rejectedCompanies: 0,
                suspendedCompanies: 0,
                reviewRequestedAgain: 0,
              },
              {
                bucket: '2026-07-01',
                registeredCompanies: 2,
                approvedCompanies: 1,
                rejectedCompanies: 0,
                suspendedCompanies: 0,
                reviewRequestedAgain: 1,
              },
              {
                bucket: '2026-07-02',
                registeredCompanies: 1,
                approvedCompanies: 0,
                rejectedCompanies: 1,
                suspendedCompanies: 0,
                reviewRequestedAgain: 0,
              },
            ],
          },
        }),
      ),
    );

    const result = await service.getCompanyGrowthSummary(admin, {
      from: '2026-07-01',
      to: '2026-07-03',
    });

    expect(result.registeredCompanies).toBe(3);
    expect(result.approvedCompanies).toBe(1);
    expect(result.rejectedCompanies).toBe(1);
    expect(result.reviewRequestedAgain).toBe(1);
    expect(result.growth.registeredCompanies.previousValue).toBe(0);
    expect(result.growth.registeredCompanies.change).toBe(3);
    expect(result.growth.registeredCompanies.percent).toBeNull();
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith(
      'http://company-service:3003/api/v1/admin/companies/growth?from=2026-06-28&to=2026-07-03',
      expect.any(Object),
    );
  });

  it('returns job growth summary from only job service', async () => {
    http.get.mockReturnValueOnce(
      of(
        response({
          success: true,
          data: {
            from: '2026-06-28',
            to: '2026-07-03',
            bucket: 'day',
            points: [
              {
                bucket: '2026-06-28',
                createdJobs: 10,
                publishedJobs: 5,
                unpublishedJobs: 0,
                closedJobs: 0,
                reviewedJobs: 4,
                rejectedJobs: 0,
                applicationsSubmitted: 10,
              },
              {
                bucket: '2026-07-01',
                createdJobs: 4,
                publishedJobs: 2,
                unpublishedJobs: 0,
                closedJobs: 0,
                reviewedJobs: 2,
                rejectedJobs: 1,
                applicationsSubmitted: 6,
              },
              {
                bucket: '2026-07-02',
                createdJobs: 3,
                publishedJobs: 1,
                unpublishedJobs: 1,
                closedJobs: 1,
                reviewedJobs: 2,
                rejectedJobs: 0,
                applicationsSubmitted: 5,
              },
            ],
          },
        }),
      ),
    );

    const result = await service.getJobGrowthSummary(admin, {
      from: '2026-07-01',
      to: '2026-07-03',
    });

    expect(result.createdJobs).toBe(7);
    expect(result.publishedJobs).toBe(3);
    expect(result.closedJobs).toBe(1);
    expect(result.applicationsSubmitted).toBe(11);
    expect(result.growth.createdJobs.previousValue).toBe(10);
    expect(result.growth.createdJobs.change).toBe(-3);
    expect(result.growth.createdJobs.percent).toBe(-30);
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith(
      'http://job-service:3004/api/v1/admin/jobs/growth?from=2026-06-28&to=2026-07-03',
      expect.any(Object),
    );
  });

  it('rejects non-admin users', async () => {
    await expect(
      service.getOverview({ id: 'candidate-1', role: UserRole.CANDIDATE }),
    ).rejects.toThrow('Only admins can access admin dashboard overview');
    expect(http.get).not.toHaveBeenCalled();
  });
});
