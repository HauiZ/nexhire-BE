import { ForbiddenException } from '@nestjs/common';
import { of } from 'rxjs';
import { UserRole } from '@nexhire/shared';
import { CompanySnapshotService } from '../company-snapshot.service';
import { CompanyStatusSnapshot, CompanyTrustLevel } from '../../entities/job.enum';

describe('CompanySnapshotService', () => {
  const httpService = {
    get: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      const values: Record<string, unknown> = {
        'jobService.services.companyService': 'http://company-service',
        'jobService.http.timeoutMs': 5000,
        'jobService.internalServiceToken': 'internal-token',
      };
      return values[key] ?? fallback;
    }),
  };

  let service: CompanySnapshotService;
  const snapshotRepo = {
    findOne: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    snapshotRepo.findOne.mockResolvedValue(null);
    service = new CompanySnapshotService(
      httpService as any,
      configService as any,
      snapshotRepo as any,
    );
  });

  it('returns approved posting snapshot from company-service', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          data: {
            companyId: 'company-1',
            companyName: 'NexHire',
            companyLogoUrl: 'https://cdn.nexhire.vn/logo.png',
            companyStatus: CompanyStatusSnapshot.APPROVED,
            companyTrustLevel: CompanyTrustLevel.HIGH,
            changedAt: '2026-07-16T00:00:00.000Z',
          },
        },
      }),
    );

    const result = await service.getPostingSnapshot({
      id: 'user-1',
      role: UserRole.RECRUITER,
      companyId: 'company-1',
    });

    expect(httpService.get).toHaveBeenCalledWith(
      'http://company-service/api/v1/internal/companies/company-1/posting-snapshot',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-internal-service-token': 'internal-token',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        companyId: 'company-1',
        companyStatus: CompanyStatusSnapshot.APPROVED,
        companyTrustLevel: CompanyTrustLevel.HIGH,
      }),
    );
  });

  it('blocks non-approved company snapshots', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          data: {
            companyId: 'company-1',
            companyName: 'NexHire',
            companyLogoUrl: null,
            companyStatus: CompanyStatusSnapshot.PENDING,
            companyTrustLevel: CompanyTrustLevel.MEDIUM,
            changedAt: '2026-07-16T00:00:00.000Z',
          },
        },
      }),
    );

    await expect(
      service.getPostingSnapshot({
        id: 'user-1',
        role: UserRole.RECRUITER,
        companyId: 'company-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
