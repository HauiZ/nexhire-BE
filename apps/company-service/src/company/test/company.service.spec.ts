import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { CompanyStatus } from '@nexhire/shared';
import { CompanyService } from '../company.service';
import { CreateCompanyDto } from '../dto/create-company.dto';
import { VerifyAction } from '../dto/verify-company.dto';
import { Company } from '../entities/company.entity';

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyService,
        {
          provide: getRepositoryToken(Company),
          useValue: companyRepo,
        },
      ],
    }).compile();

    service = module.get(CompanyService);
    jest.clearAllMocks();
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
  });

  it('hides unapproved companies from public profile', async () => {
    companyRepo.findOne.mockResolvedValueOnce(null);

    await expect(service.getPublicProfile(mockCompanyId)).rejects.toThrow(NotFoundException);
  });
});
