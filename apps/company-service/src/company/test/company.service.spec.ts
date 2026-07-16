import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { CompanyStatus, CompanyTrustLevel } from '@nexhire/shared';
import { CompanyService } from '../company.service';
import { CreateCompanyDto } from '../dto/create-company.dto';
import { CompanyProcessedTrustSignal } from '../entities/company-processed-trust-signal.entity';
import { CompanyTrustHistory } from '../entities/company-trust-history.entity';
import { VerifyAction } from '../dto/verify-company.dto';
import { Company } from '../entities/company.entity';
import { CompanyEventPublisher } from '../events/company-event.publisher';

const mockUserId = '00000000-0000-4000-8000-000000000001';
const mockCompanyId = '00000000-0000-4000-8000-000000000002';

function createCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: mockCompanyId,
    name: 'NexHire Tech',
    logo: null,
    description: null,
    website: null,
    address: null,
    taxCode: '0101234567',
    ownerId: mockUserId,
    status: CompanyStatus.PENDING,
    trustLevel: CompanyTrustLevel.MEDIUM,
    approvedLowRiskCount: 0,
    negativeTrustSignalCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('CompanyService', () => {
  let service: CompanyService;
  const companyRepo = {
    create: jest.fn((entity: Partial<Company>) => entity),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const trustHistoryRepo = {
    create: jest.fn((entity: Partial<CompanyTrustHistory>) => entity),
    find: jest.fn(),
    save: jest.fn(),
  };
  const processedTrustSignalRepo = {
    insert: jest.fn(),
  };
  const companyEventPublisher = {
    publishPostingSnapshotChanged: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyService,
        {
          provide: getRepositoryToken(Company),
          useValue: companyRepo,
        },
        {
          provide: getRepositoryToken(CompanyTrustHistory),
          useValue: trustHistoryRepo,
        },
        {
          provide: getRepositoryToken(CompanyProcessedTrustSignal),
          useValue: processedTrustSignalRepo,
        },
        {
          provide: CompanyEventPublisher,
          useValue: companyEventPublisher,
        },
      ],
    }).compile();

    service = module.get(CompanyService);
    jest.clearAllMocks();
    companyEventPublisher.publishPostingSnapshotChanged.mockResolvedValue(undefined);
    trustHistoryRepo.save.mockResolvedValue(undefined);
    processedTrustSignalRepo.insert.mockResolvedValue(undefined);
  });

  it('creates a pending company for a recruiter owner', async () => {
    const company = createCompany();
    companyRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    companyRepo.create.mockReturnValue(company);
    companyRepo.save.mockResolvedValue(company);

    const dto: CreateCompanyDto = { name: 'NexHire Tech', taxCode: ' 0101234567 ' };
    const result = await service.create(mockUserId, dto);

    expect(companyRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: mockUserId,
        status: CompanyStatus.PENDING,
        taxCode: '0101234567',
      }),
    );
    expect(result.status).toBe(CompanyStatus.PENDING);
    expect(companyEventPublisher.publishPostingSnapshotChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: mockCompanyId,
        ownerUserId: mockUserId,
        companyStatus: CompanyStatus.PENDING,
        companyTrustLevel: CompanyTrustLevel.MEDIUM,
      }),
    );
  });

  it('rejects duplicate owner company creation', async () => {
    companyRepo.findOne.mockResolvedValueOnce(createCompany());

    await expect(
      service.create(mockUserId, { name: 'Another Company', taxCode: '0101234567' }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects duplicate tax code creation', async () => {
    companyRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(createCompany());

    await expect(
      service.create(mockUserId, { name: 'Another Company', taxCode: '0101234567' }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects update by a non-owner', async () => {
    companyRepo.findOne.mockResolvedValueOnce(createCompany());

    await expect(
      service.update(mockCompanyId, '00000000-0000-4000-8000-000000000099', {
        name: 'New Name',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('resets status to pending when major fields change', async () => {
    const company = createCompany({ status: CompanyStatus.APPROVED });
    companyRepo.findOne.mockResolvedValueOnce(company).mockResolvedValueOnce(null);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    const result = await service.update(mockCompanyId, mockUserId, { taxCode: '0107654321' });

    expect(company.status).toBe(CompanyStatus.PENDING);
    expect(result.status).toBe(CompanyStatus.PENDING);
  });

  it('approves a company', async () => {
    const company = createCompany();
    companyRepo.findOne.mockResolvedValueOnce(company);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    const result = await service.verify(mockCompanyId, VerifyAction.APPROVE);

    expect(company.status).toBe(CompanyStatus.APPROVED);
    expect(result.status).toBe(CompanyStatus.APPROVED);
  });

  it('rejects a company', async () => {
    const company = createCompany();
    companyRepo.findOne.mockResolvedValueOnce(company);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    const result = await service.verify(mockCompanyId, VerifyAction.REJECT);

    expect(company.status).toBe(CompanyStatus.REJECTED);
    expect(result.status).toBe(CompanyStatus.REJECTED);
  });

  it('rejects invalid verify actions explicitly', async () => {
    companyRepo.findOne.mockResolvedValueOnce(createCompany());

    await expect(service.verify(mockCompanyId, 'INVALID' as VerifyAction)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lets admin update trust level manually and records history with reason', async () => {
    const company = createCompany({ trustLevel: CompanyTrustLevel.MEDIUM });
    companyRepo.findOne.mockResolvedValueOnce(company);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    const result = await service.updateTrustLevel(mockCompanyId, 'admin-1', {
      trustLevel: CompanyTrustLevel.HIGH,
      reason: 'Consistently approved low-risk jobs',
    });

    expect(result.trustLevel).toBe(CompanyTrustLevel.HIGH);
    expect(trustHistoryRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: mockCompanyId,
        previousTrustLevel: CompanyTrustLevel.MEDIUM,
        newTrustLevel: CompanyTrustLevel.HIGH,
        direction: 'INCREASE',
        source: 'MANUAL',
        changedByUserId: 'admin-1',
        reason: 'Consistently approved low-risk jobs',
      }),
    );
  });

  it('returns only public fields for approved companies', async () => {
    companyRepo.findOne.mockResolvedValueOnce(createCompany({ status: CompanyStatus.APPROVED }));

    const result = await service.getPublicProfile(mockCompanyId);

    expect(result).toEqual(
      expect.objectContaining({
        id: mockCompanyId,
        name: 'NexHire Tech',
      }),
    );
    expect(result).not.toHaveProperty('taxCode');
    expect(result).not.toHaveProperty('ownerId');
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('trustLevel');
  });

  it('auto increases trust after repeated approved low-risk jobs', async () => {
    const company = createCompany({
      status: CompanyStatus.APPROVED,
      trustLevel: CompanyTrustLevel.MEDIUM,
      approvedLowRiskCount: 4,
    });
    companyRepo.findOne.mockResolvedValueOnce(company);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    await service.recordTrustSignal({
      companyId: mockCompanyId,
      jobId: 'job-1',
      targetType: 'JOB',
      targetId: 'job-1',
      decision: 'APPROVE' as any,
      riskLevel: 'LOW' as any,
      riskScore: 10,
    });

    expect(company.trustLevel).toBe(CompanyTrustLevel.HIGH);
    expect(company.approvedLowRiskCount).toBe(0);
    expect(company.negativeTrustSignalCount).toBe(0);
    expect(companyEventPublisher.publishPostingSnapshotChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        companyTrustLevel: CompanyTrustLevel.HIGH,
      }),
    );
    expect(trustHistoryRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: mockCompanyId,
        previousTrustLevel: CompanyTrustLevel.MEDIUM,
        newTrustLevel: CompanyTrustLevel.HIGH,
        direction: 'INCREASE',
        source: 'AUTO',
        reason: '5 approved low-risk job reviews reached',
      }),
    );
  });

  it('does not punish trust when admin approves a high-risk job', async () => {
    const company = createCompany({
      status: CompanyStatus.APPROVED,
      trustLevel: CompanyTrustLevel.MEDIUM,
      negativeTrustSignalCount: 2,
    });
    companyRepo.findOne.mockResolvedValueOnce(company);

    await service.recordTrustSignal({
      companyId: mockCompanyId,
      jobId: 'job-1',
      targetType: 'JOB',
      targetId: 'job-1',
      decision: 'APPROVE' as any,
      riskLevel: 'HIGH' as any,
      riskScore: 70,
    });

    expect(companyRepo.save).not.toHaveBeenCalled();
    expect(company.trustLevel).toBe(CompanyTrustLevel.MEDIUM);
    expect(company.negativeTrustSignalCount).toBe(2);
  });

  it('auto decreases trust after repeated rejected jobs', async () => {
    const company = createCompany({
      status: CompanyStatus.APPROVED,
      trustLevel: CompanyTrustLevel.MEDIUM,
      negativeTrustSignalCount: 2,
    });
    companyRepo.findOne.mockResolvedValueOnce(company);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    await service.recordTrustSignal({
      companyId: mockCompanyId,
      jobId: 'job-1',
      targetType: 'JOB',
      targetId: 'job-1',
      decision: 'REJECT' as any,
      riskLevel: 'HIGH' as any,
      riskScore: 70,
    });

    expect(company.trustLevel).toBe(CompanyTrustLevel.LOW);
    expect(company.approvedLowRiskCount).toBe(0);
    expect(company.negativeTrustSignalCount).toBe(0);
    expect(trustHistoryRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        previousTrustLevel: CompanyTrustLevel.MEDIUM,
        newTrustLevel: CompanyTrustLevel.LOW,
        direction: 'DECREASE',
        source: 'AUTO',
        reason: '3 negative job review signals reached',
      }),
    );
  });

  it('ignores duplicate job review trust signals', async () => {
    const company = createCompany({
      status: CompanyStatus.APPROVED,
      trustLevel: CompanyTrustLevel.MEDIUM,
      approvedLowRiskCount: 4,
    });
    companyRepo.findOne.mockResolvedValueOnce(company);
    processedTrustSignalRepo.insert.mockRejectedValueOnce({ code: '23505' });

    await service.recordTrustSignal({
      companyId: mockCompanyId,
      jobId: 'job-1',
      targetType: 'JOB',
      targetId: 'job-1',
      decision: 'APPROVE' as any,
      riskLevel: 'LOW' as any,
      riskScore: 10,
    });

    expect(companyRepo.save).not.toHaveBeenCalled();
    expect(trustHistoryRepo.save).not.toHaveBeenCalled();
    expect(companyEventPublisher.publishPostingSnapshotChanged).not.toHaveBeenCalled();
    expect(company.trustLevel).toBe(CompanyTrustLevel.MEDIUM);
    expect(company.approvedLowRiskCount).toBe(4);
  });

  it('hides unapproved companies from public profile', async () => {
    companyRepo.findOne.mockResolvedValueOnce(null);

    await expect(service.getPublicProfile(mockCompanyId)).rejects.toThrow(NotFoundException);
  });
});
