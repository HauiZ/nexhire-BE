import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { ERROR_CODES, UserRole } from '@nexhire/shared';
import { RecruiterDashboardService } from './recruiter-dashboard.service';

function response<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as AxiosResponse<T>['config'],
  };
}

describe('RecruiterDashboardService', () => {
  const http = { get: jest.fn() };
  const config = { get: jest.fn() };
  const user = { id: 'user-1', role: UserRole.RECRUITER };
  let service: RecruiterDashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        'gateway.services.companyService': 'http://company-service:3003',
        'gateway.services.jobService': 'http://job-service:3004',
        'gateway.services.applicationService': 'http://application-service:3005',
      };
      return values[key];
    });
    service = new RecruiterDashboardService(
      http as unknown as HttpService,
      config as unknown as ConfigService,
    );
  });

  it('aggregates company, job, and application dashboard data', async () => {
    http.get
      .mockReturnValueOnce(
        of(
          response({
            success: true,
            data: {
              id: 'company-1',
              status: 'APPROVED',
              canPostJobs: true,
              completionPercent: 100,
              submittedAt: '2026-07-16T09:00:00.000Z',
              rejectionReason: null,
            },
          }),
        ),
      )
      .mockReturnValueOnce(
        of(
          response({
            success: true,
            data: {
              DRAFT: 1,
              PENDING_REVIEW: 2,
              NEEDS_REVIEW: 1,
              SHOULD_REJECT: 0,
              PUBLISHED: 4,
              UNPUBLISHED: 1,
              REJECTED: 0,
              CLOSED: 0,
              EXPIRED: 0,
            },
          }),
        ),
      )
      .mockReturnValueOnce(
        of(
          response({
            success: true,
            data: {
              total: 10,
              byStatus: {
                SUBMITTED: 3,
                OFFERED: 2,
                REJECTED: 1,
                WITHDRAWN: 0,
                CANCELLED: 0,
              },
              responseRate: 30,
            },
          }),
        ),
      );

    const result = await service.getSummary(user);

    expect(result.company).toEqual(
      expect.objectContaining({
        id: 'company-1',
        status: 'APPROVED',
        canPostJobs: true,
        completionPercent: 100,
      }),
    );
    expect(result.stats).toEqual({
      activeJobs: 4,
      pendingJobs: 3,
      newApplications: 3,
      responseRate: 30,
      responseRateWindowDays: 6,
    });
    expect(result.tasks).toEqual({
      verifyCompany: false,
      pendingJobs: 3,
      submittedApplications: 3,
    });
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      'http://job-service:3004/api/v1/recruiter/jobs/status-counts',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-company-id': 'company-1' }),
      }),
    );
  });

  it('returns an empty NO_COMPANY summary when recruiter has no company', async () => {
    http.get.mockReturnValueOnce(
      throwError(() => ({
        response: {
          status: 404,
          data: { error: { code: ERROR_CODES.COMPANY.NOT_FOUND } },
        },
        message: 'not found',
      })),
    );

    const result = await service.getSummary(user);

    expect(result.company.status).toBe('NO_COMPANY');
    expect(result.stats.activeJobs).toBe(0);
    expect(result.tasks.verifyCompany).toBe(true);
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('preserves upstream error codes for non-company-not-found failures', async () => {
    http.get
      .mockReturnValueOnce(
        of(
          response({
            success: true,
            data: {
              id: 'company-1',
              status: 'APPROVED',
              canPostJobs: true,
              completionPercent: 100,
              submittedAt: null,
              rejectionReason: null,
            },
          }),
        ),
      )
      .mockReturnValueOnce(
        throwError(() => ({
          response: {
            status: 403,
            data: {
              success: false,
              error: {
                code: ERROR_CODES.JOB.COMPANY_REQUIRED,
                message: 'Recruiter must belong to a company',
              },
            },
          },
          message: 'forbidden',
        })),
      )
      .mockReturnValueOnce(
        of(
          response({
            success: true,
            data: {
              total: 0,
              byStatus: {
                SUBMITTED: 0,
                OFFERED: 0,
                REJECTED: 0,
                WITHDRAWN: 0,
                CANCELLED: 0,
              },
              responseRate: 0,
            },
          }),
        ),
      );

    await expect(service.getSummary(user)).rejects.toMatchObject({
      response: {
        code: ERROR_CODES.JOB.COMPANY_REQUIRED,
        message: 'Recruiter must belong to a company',
      },
      status: 403,
    });
  });
});
