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

  it('rejects non-admin users', async () => {
    await expect(
      service.getOverview({ id: 'candidate-1', role: UserRole.CANDIDATE }),
    ).rejects.toThrow('Only admins can access admin dashboard overview');
    expect(http.get).not.toHaveBeenCalled();
  });
});
