import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Brackets } from 'typeorm';
import {
  CompanyStatus,
  CompanyTrustLevel,
  JobModerationRiskLevel,
  JobReviewDecision,
  UserRole,
} from '@nexhire/shared';
import { CompanyService } from '../company.service';
import { CreateCompanyDto } from '../dto/create-company.dto';
import { CompanyProcessedTrustSignal } from '../entities/company-processed-trust-signal.entity';
import { CompanyTrustHistory } from '../entities/company-trust-history.entity';
import {
  CompanyVerificationDocument,
  CompanyVerificationDocumentType,
} from '../entities/company-verification-document.entity';
import { VerifyAction } from '../dto/verify-company.dto';
import { Company } from '../entities/company.entity';
import { CompanyEventPublisher } from '../events/company-event.publisher';
import { DocumentClientService } from '../../document-client/document-client.service';

const mockUserId = '00000000-0000-4000-8000-000000000001';
const mockCompanyId = '00000000-0000-4000-8000-000000000002';

function createCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: mockCompanyId,
    name: 'NexHire Tech',
    logo: null,
    logoDocumentId: null,
    description: null,
    industry: null,
    size: null,
    foundedYear: null,
    mission: null,
    culture: null,
    values: [],
    perks: [],
    heroImageUrl: null,
    heroImageDocumentId: null,
    website: null,
    contactEmail: null,
    contactPhone: null,
    address: null,
    taxCode: '0101234567',
    ownerId: mockUserId,
    status: CompanyStatus.PENDING,
    statusReason: null,
    statusChangedAt: null,
    statusChangedByUserId: null,
    verificationRejectedCount: 0,
    lastVerificationRejectedReason: null,
    lastVerificationRejectedAt: null,
    verificationReviewRequestedAt: null,
    verificationReviewRequestedByUserId: null,
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
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
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
  const verificationDocumentRepo = {
    create: jest.fn((entity: Partial<CompanyVerificationDocument>) => entity),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  };
  const companyEventPublisher = {
    publishPostingSnapshotChanged: jest.fn(),
  };
  const documentClientService = {
    uploadCompanyLogo: jest.fn(),
    uploadCompanyHeroImage: jest.fn(),
    getDocumentMetadata: jest.fn(),
    getDocumentDownload: jest.fn(),
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
          provide: getRepositoryToken(CompanyVerificationDocument),
          useValue: verificationDocumentRepo,
        },
        {
          provide: CompanyEventPublisher,
          useValue: companyEventPublisher,
        },
        {
          provide: DocumentClientService,
          useValue: documentClientService,
        },
      ],
    }).compile();

    service = module.get(CompanyService);
    jest.clearAllMocks();
    companyEventPublisher.publishPostingSnapshotChanged.mockResolvedValue(undefined);
    trustHistoryRepo.save.mockResolvedValue(undefined);
    processedTrustSignalRepo.insert.mockResolvedValue(undefined);
    verificationDocumentRepo.save.mockImplementation((entity) =>
      Promise.resolve({
        id: '00000000-0000-4000-8000-000000000077',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...entity,
      }),
    );
    verificationDocumentRepo.find.mockResolvedValue([]);
    verificationDocumentRepo.findOne.mockResolvedValue(null);
    verificationDocumentRepo.softDelete.mockResolvedValue({ affected: 1 });
    documentClientService.uploadCompanyLogo.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000099',
      url: 'https://cdn.nexhire.vn/company/logo.png',
    });
    documentClientService.uploadCompanyHeroImage.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000088',
      url: 'https://cdn.nexhire.vn/company/hero.png',
    });
    documentClientService.getDocumentMetadata.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000066',
      documentType: 'CERTIFICATE',
      ownerType: 'company',
      ownerId: mockCompanyId,
      fileName: 'business-license.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    documentClientService.getDocumentDownload.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000066',
      documentType: 'CERTIFICATE',
      ownerType: 'company',
      ownerId: mockCompanyId,
      fileName: 'business-license.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      url: 'https://storage.local/business-license.pdf',
      expiresInSeconds: 3600,
    });
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

  it('lists companies for admin with filters and pagination', async () => {
    const company = createCompany({ verificationRejectedCount: 2 });
    const qb = {
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[company], 1]),
    };
    companyRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listAdmin({
      page: 1,
      limit: 10,
      skip: 0,
      status: CompanyStatus.PENDING,
      trustLevel: CompanyTrustLevel.MEDIUM,
      search: 'nexhire',
      hasRejectedBefore: 'true',
      sort: 'rejected_count_desc' as never,
    });

    expect(qb.andWhere).toHaveBeenCalledWith('company.status = :status', {
      status: CompanyStatus.PENDING,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('company.trustLevel = :trustLevel', {
      trustLevel: CompanyTrustLevel.MEDIUM,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('company.verificationRejectedCount > 0');
    const searchBracket = qb.andWhere.mock.calls
      .map(([condition]) => condition)
      .find((condition) => condition instanceof Brackets) as
      | { whereFactory: (where: { where: jest.Mock; orWhere: jest.Mock }) => void }
      | undefined;
    const searchWhere = {
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
    };
    searchBracket?.whereFactory(searchWhere);
    expect(searchWhere.orWhere).toHaveBeenCalledWith(
      'CAST("company"."owner_id" AS TEXT) ILIKE :search',
      { search: '%nexhire%' },
    );
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result.meta).toEqual({ page: 1, limit: 10, total: 1 });
    expect(result.data[0].verificationRejectedCount).toBe(2);
  });

  it('returns company admin overview counts', async () => {
    companyRepo.count.mockResolvedValueOnce(4);
    const statusQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { status: CompanyStatus.PENDING, count: '2' },
        { status: CompanyStatus.APPROVED, count: '1' },
        { status: CompanyStatus.REJECTED, count: '1' },
      ]),
    };
    const trustQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { trustLevel: CompanyTrustLevel.LOW, count: '1' },
        { trustLevel: CompanyTrustLevel.MEDIUM, count: '3' },
      ]),
    };
    const pendingAgainQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
    };
    const rejectedBeforeQb = {
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(2),
    };
    companyRepo.createQueryBuilder
      .mockReturnValueOnce(statusQb)
      .mockReturnValueOnce(trustQb)
      .mockReturnValueOnce(pendingAgainQb)
      .mockReturnValueOnce(rejectedBeforeQb);

    const result = await service.getAdminOverview();

    expect(result.total).toBe(4);
    expect(result.byStatus.PENDING).toBe(2);
    expect(result.byStatus.SUSPENDED).toBe(0);
    expect(result.byTrustLevel.MEDIUM).toBe(3);
    expect(result.pendingReviewAgain).toBe(1);
    expect(result.rejectedBefore).toBe(2);
  });

  it('returns company growth chart buckets with review lifecycle counts', async () => {
    const makeQb = (rows: unknown[]) => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    });
    companyRepo.createQueryBuilder
      .mockReturnValueOnce(makeQb([{ bucket: '2026-07-01', count: '3' }]))
      .mockReturnValueOnce(makeQb([{ bucket: '2026-07-01', count: '1' }]))
      .mockReturnValueOnce(makeQb([{ bucket: '2026-07-02', count: '1' }]))
      .mockReturnValueOnce(makeQb([{ bucket: '2026-07-02', count: '2' }]))
      .mockReturnValueOnce(makeQb([{ bucket: '2026-07-01', count: '1' }]));

    const result = await service.getAdminGrowth({
      from: '2026-07-01',
      to: '2026-07-02',
      bucket: 'day' as never,
    });

    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toMatchObject({
      bucket: '2026-07-01',
      registeredCompanies: 3,
      approvedCompanies: 1,
      reviewRequestedAgain: 1,
    });
    expect(result.points[1]).toMatchObject({
      bucket: '2026-07-02',
      rejectedCompanies: 1,
      suspendedCompanies: 2,
    });
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
    const company = createCompany({
      status: CompanyStatus.APPROVED,
      logo: 'https://cdn.nexhire.vn/company/old-logo.png',
    });
    companyRepo.findOne.mockResolvedValueOnce(company).mockResolvedValueOnce(null);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    const result = await service.update(mockCompanyId, mockUserId, { taxCode: '0107654321' });

    expect(company.status).toBe(CompanyStatus.PENDING);
    expect(result.status).toBe(CompanyStatus.PENDING);
  });

  it('keeps approval when public profile enrichment fields change', async () => {
    const company = createCompany({ status: CompanyStatus.APPROVED });
    companyRepo.findOne.mockResolvedValueOnce(company);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    const result = await service.update(mockCompanyId, mockUserId, {
      industry: 'HR Tech',
      mission: 'Build reliable recruitment automation.',
      values: ['Ownership', 'Candidate empathy'],
      perks: ['Flexible schedule'],
    });

    expect(company.status).toBe(CompanyStatus.APPROVED);
    expect(result.status).toBe(CompanyStatus.APPROVED);
    expect(result.values).toEqual(['Ownership', 'Candidate empathy']);
    expect(companyEventPublisher.publishPostingSnapshotChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: mockCompanyId,
        companyStatus: CompanyStatus.APPROVED,
        previousCompanyStatus: CompanyStatus.APPROVED,
      }),
    );
  });

  it('keeps approval when company contact fields change', async () => {
    const company = createCompany({ status: CompanyStatus.APPROVED });
    companyRepo.findOne.mockResolvedValueOnce(company);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    const result = await service.update(mockCompanyId, mockUserId, {
      contactEmail: 'hr@nexhire.vn',
      contactPhone: '02473001234',
    });

    expect(company.status).toBe(CompanyStatus.APPROVED);
    expect(result.contactEmail).toBe('hr@nexhire.vn');
    expect(result.contactPhone).toBe('02473001234');
  });

  it('clears document image ids when legacy image URLs are updated', async () => {
    const company = createCompany({
      status: CompanyStatus.APPROVED,
      logoDocumentId: '00000000-0000-4000-8000-000000000099',
      heroImageDocumentId: '00000000-0000-4000-8000-000000000088',
    });
    companyRepo.findOne.mockResolvedValueOnce(company);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    const result = await service.update(mockCompanyId, mockUserId, {
      logo: 'https://cdn.nexhire.vn/company/logo-fallback.png',
      heroImageUrl: 'https://cdn.nexhire.vn/company/hero-fallback.png',
    });

    expect(result.logo).toBe('https://cdn.nexhire.vn/company/logo-fallback.png');
    expect(result.logoDocumentId).toBeUndefined();
    expect(result.heroImageUrl).toBe('https://cdn.nexhire.vn/company/hero-fallback.png');
    expect(result.heroImageDocumentId).toBeUndefined();
    expect(company.status).toBe(CompanyStatus.APPROVED);
  });

  it('uploads company logo through document-storage and stores logo document id', async () => {
    const company = createCompany({ status: CompanyStatus.APPROVED });
    companyRepo.findOne.mockResolvedValueOnce(company);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    const result = await service.uploadLogo(
      mockCompanyId,
      { id: mockUserId, role: UserRole.RECRUITER },
      {
        buffer: Buffer.from('logo'),
        originalname: 'logo.png',
        mimetype: 'image/png',
        size: 4,
      },
    );

    expect(documentClientService.uploadCompanyLogo).toHaveBeenCalledWith(
      { id: mockUserId, role: UserRole.RECRUITER },
      mockCompanyId,
      expect.objectContaining({ originalname: 'logo.png' }),
    );
    expect(company.logoDocumentId).toBe('00000000-0000-4000-8000-000000000099');
    expect(company.logo).toBeNull();
    expect(company.status).toBe(CompanyStatus.APPROVED);
    expect(result.logo).toBeUndefined();
    expect(result.logoDocumentId).toBe('00000000-0000-4000-8000-000000000099');
    expect(companyEventPublisher.publishPostingSnapshotChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: mockCompanyId,
        companyLogoDocumentId: '00000000-0000-4000-8000-000000000099',
        companyStatus: CompanyStatus.APPROVED,
      }),
    );
  });

  it('uploads company hero image through document-storage without resetting approval', async () => {
    const company = createCompany({
      status: CompanyStatus.APPROVED,
      heroImageUrl: 'https://cdn.nexhire.vn/company/old-hero.png',
    });
    companyRepo.findOne.mockResolvedValueOnce(company);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    const result = await service.uploadHeroImage(
      mockCompanyId,
      { id: mockUserId, role: UserRole.RECRUITER },
      {
        buffer: Buffer.from('hero'),
        originalname: 'hero.webp',
        mimetype: 'image/webp',
        size: 4,
      },
    );

    expect(documentClientService.uploadCompanyHeroImage).toHaveBeenCalledWith(
      { id: mockUserId, role: UserRole.RECRUITER },
      mockCompanyId,
      expect.objectContaining({ originalname: 'hero.webp' }),
    );
    expect(company.heroImageDocumentId).toBe('00000000-0000-4000-8000-000000000088');
    expect(company.heroImageUrl).toBeNull();
    expect(company.status).toBe(CompanyStatus.APPROVED);
    expect(result.heroImageDocumentId).toBe('00000000-0000-4000-8000-000000000088');
    expect(companyEventPublisher.publishPostingSnapshotChanged).not.toHaveBeenCalled();
  });

  it('approves a company', async () => {
    const company = createCompany();
    companyRepo.findOne.mockResolvedValueOnce(company);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    const result = await service.verify(mockCompanyId, VerifyAction.APPROVE, 'admin-1');

    expect(company.status).toBe(CompanyStatus.APPROVED);
    expect(company.statusReason).toBeNull();
    expect(company.statusChangedByUserId).toBe('admin-1');
    expect(result.status).toBe(CompanyStatus.APPROVED);
  });

  it('rejects a company with reason', async () => {
    const company = createCompany();
    companyRepo.findOne.mockResolvedValueOnce(company);
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    const result = await service.verify(
      mockCompanyId,
      VerifyAction.REJECT,
      'admin-1',
      'Invalid business license',
    );

    expect(company.status).toBe(CompanyStatus.REJECTED);
    expect(company.statusReason).toBe('Invalid business license');
    expect(company.verificationRejectedCount).toBe(1);
    expect(company.lastVerificationRejectedReason).toBe('Invalid business license');
    expect(company.lastVerificationRejectedAt).toBeInstanceOf(Date);
    expect(company.verificationReviewRequestedAt).toBeNull();
    expect(company.verificationReviewRequestedByUserId).toBeNull();
    expect(result.rejectionReason).toBe('Invalid business license');
    expect(result.verificationRejectedCount).toBe(1);
    expect(result.lastVerificationRejectedReason).toBe('Invalid business license');
    expect(result.status).toBe(CompanyStatus.REJECTED);
  });

  it('requires a reason when rejecting a company', async () => {
    companyRepo.findOne.mockResolvedValueOnce(createCompany());

    await expect(service.verify(mockCompanyId, VerifyAction.REJECT, 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
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
        values: [],
        perks: [],
      }),
    );
    expect(result).not.toHaveProperty('taxCode');
    expect(result).not.toHaveProperty('ownerId');
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('canPostJobs');
    expect(result).not.toHaveProperty('statusReason');
    expect(result).not.toHaveProperty('trustLevel');
  });

  it('attaches and lists company verification documents', async () => {
    const company = createCompany({ status: CompanyStatus.PENDING });
    companyRepo.findOne.mockResolvedValue(company);

    const attached = await service.attachVerificationDocument(
      mockCompanyId,
      { id: mockUserId, role: UserRole.RECRUITER },
      {
        documentId: '00000000-0000-4000-8000-000000000066',
        type: CompanyVerificationDocumentType.BUSINESS_LICENSE,
      },
    );

    expect(attached).toEqual(
      expect.objectContaining({
        companyId: mockCompanyId,
        documentId: '00000000-0000-4000-8000-000000000066',
        type: CompanyVerificationDocumentType.BUSINESS_LICENSE,
      }),
    );
    expect(verificationDocumentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: mockCompanyId,
        uploadedByUserId: mockUserId,
      }),
    );
    expect(documentClientService.getDocumentMetadata).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000066',
    );
  });

  it('rejects verification documents that belong to another owner', async () => {
    const company = createCompany({ status: CompanyStatus.PENDING });
    companyRepo.findOne.mockResolvedValue(company);
    documentClientService.getDocumentMetadata.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000066',
      documentType: 'CERTIFICATE',
      ownerType: 'company',
      ownerId: '00000000-0000-4000-8000-000000000099',
    });

    await expect(
      service.attachVerificationDocument(
        mockCompanyId,
        { id: mockUserId, role: UserRole.RECRUITER },
        {
          documentId: '00000000-0000-4000-8000-000000000066',
          type: CompanyVerificationDocumentType.BUSINESS_LICENSE,
        },
      ),
    ).rejects.toThrow('Verification document must belong to this company');
    expect(verificationDocumentRepo.save).not.toHaveBeenCalled();
  });

  it('rejects verification documents uploaded as non-proof document types', async () => {
    const company = createCompany({ status: CompanyStatus.PENDING });
    companyRepo.findOne.mockResolvedValue(company);
    documentClientService.getDocumentMetadata.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000066',
      documentType: 'LOGO',
      ownerType: 'company',
      ownerId: mockCompanyId,
    });

    await expect(
      service.attachVerificationDocument(
        mockCompanyId,
        { id: mockUserId, role: UserRole.RECRUITER },
        {
          documentId: '00000000-0000-4000-8000-000000000066',
          type: CompanyVerificationDocumentType.BUSINESS_LICENSE,
        },
      ),
    ).rejects.toThrow('Verification proof must be uploaded as CERTIFICATE or OTHER document type');
    expect(verificationDocumentRepo.save).not.toHaveBeenCalled();
  });

  it('returns a conflict when the verification document is already attached', async () => {
    const company = createCompany({ status: CompanyStatus.PENDING });
    companyRepo.findOne.mockResolvedValue(company);
    verificationDocumentRepo.save.mockRejectedValueOnce({ code: '23505' });

    await expect(
      service.attachVerificationDocument(
        mockCompanyId,
        { id: mockUserId, role: UserRole.RECRUITER },
        {
          documentId: '00000000-0000-4000-8000-000000000066',
          type: CompanyVerificationDocumentType.BUSINESS_LICENSE,
        },
      ),
    ).rejects.toThrow('Verification document already attached to this company');
  });

  it('returns verification document metadata for admin review', async () => {
    const company = createCompany({ status: CompanyStatus.PENDING });
    companyRepo.findOne.mockResolvedValue(company);
    verificationDocumentRepo.find.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000077',
        companyId: mockCompanyId,
        documentId: '00000000-0000-4000-8000-000000000066',
        type: CompanyVerificationDocumentType.BUSINESS_LICENSE,
        uploadedByUserId: mockUserId,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const result = await service.listAdminVerificationDocuments(mockCompanyId);

    expect(result).toEqual([
      expect.objectContaining({
        documentId: '00000000-0000-4000-8000-000000000066',
        fileName: 'business-license.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      }),
    ]);
    expect(documentClientService.getDocumentMetadata).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000066',
    );
  });

  it('returns verification document metadata for recruiter owner review', async () => {
    const company = createCompany({ status: CompanyStatus.REJECTED });
    companyRepo.findOne.mockResolvedValue(company);
    verificationDocumentRepo.find.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000077',
        companyId: mockCompanyId,
        documentId: '00000000-0000-4000-8000-000000000066',
        type: CompanyVerificationDocumentType.BUSINESS_LICENSE,
        uploadedByUserId: mockUserId,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const result = await service.listVerificationDocuments(mockCompanyId, {
      id: mockUserId,
      role: UserRole.RECRUITER,
    });

    expect(result).toEqual([
      expect.objectContaining({
        documentId: '00000000-0000-4000-8000-000000000066',
        documentType: 'CERTIFICATE',
        fileName: 'business-license.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      }),
    ]);
  });

  it('returns a verification document download URL for recruiter owner', async () => {
    const company = createCompany({ status: CompanyStatus.REJECTED });
    companyRepo.findOne.mockResolvedValue(company);
    verificationDocumentRepo.findOne.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000077',
      companyId: mockCompanyId,
      documentId: '00000000-0000-4000-8000-000000000066',
      type: CompanyVerificationDocumentType.BUSINESS_LICENSE,
      uploadedByUserId: mockUserId,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.getVerificationDocumentDownload(
      mockCompanyId,
      '00000000-0000-4000-8000-000000000066',
      { id: mockUserId, role: UserRole.RECRUITER },
    );

    expect(result).toEqual(
      expect.objectContaining({
        documentId: '00000000-0000-4000-8000-000000000066',
        url: 'https://storage.local/business-license.pdf',
        expiresInSeconds: 3600,
      }),
    );
  });

  it('lets recruiter request verification review again for a rejected company when proof exists', async () => {
    const company = createCompany({
      status: CompanyStatus.REJECTED,
      statusReason: 'Missing proof',
      verificationRejectedCount: 2,
      lastVerificationRejectedReason: 'Missing proof',
      lastVerificationRejectedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    companyRepo.findOne.mockResolvedValue(company);
    verificationDocumentRepo.findOne.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000077',
      companyId: mockCompanyId,
      documentId: '00000000-0000-4000-8000-000000000066',
      type: CompanyVerificationDocumentType.BUSINESS_LICENSE,
      uploadedByUserId: mockUserId,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    companyRepo.save.mockImplementation((entity: Company) => Promise.resolve(entity));

    const result = await service.requestVerificationReview(mockCompanyId, {
      id: mockUserId,
      role: UserRole.RECRUITER,
    });

    expect(company.status).toBe(CompanyStatus.PENDING);
    expect(company.statusReason).toBeNull();
    expect(company.statusChangedByUserId).toBe(mockUserId);
    expect(company.verificationRejectedCount).toBe(2);
    expect(company.lastVerificationRejectedReason).toBe('Missing proof');
    expect(company.verificationReviewRequestedAt).toBeInstanceOf(Date);
    expect(company.verificationReviewRequestedByUserId).toBe(mockUserId);
    expect(result.status).toBe(CompanyStatus.PENDING);
    expect(result.verificationRejectedCount).toBe(2);
    expect(result.lastVerificationRejectedReason).toBe('Missing proof');
    expect(companyEventPublisher.publishPostingSnapshotChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: mockCompanyId,
        companyStatus: CompanyStatus.PENDING,
        previousCompanyStatus: CompanyStatus.REJECTED,
      }),
    );
  });

  it('rejects resubmission without verification proof documents', async () => {
    const company = createCompany({ status: CompanyStatus.REJECTED });
    companyRepo.findOne.mockResolvedValue(company);
    verificationDocumentRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.requestVerificationReview(mockCompanyId, {
        id: mockUserId,
        role: UserRole.RECRUITER,
      }),
    ).rejects.toThrow('At least one verification document is required before review');
    expect(companyRepo.save).not.toHaveBeenCalled();
  });

  it('returns a verification document download URL for admin review', async () => {
    const company = createCompany({ status: CompanyStatus.PENDING });
    companyRepo.findOne.mockResolvedValue(company);
    verificationDocumentRepo.findOne.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000077',
      companyId: mockCompanyId,
      documentId: '00000000-0000-4000-8000-000000000066',
      type: CompanyVerificationDocumentType.BUSINESS_LICENSE,
      uploadedByUserId: mockUserId,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.getAdminVerificationDocumentDownload(
      mockCompanyId,
      '00000000-0000-4000-8000-000000000066',
    );

    expect(result).toEqual(
      expect.objectContaining({
        documentId: '00000000-0000-4000-8000-000000000066',
        url: 'https://storage.local/business-license.pdf',
        expiresInSeconds: 3600,
      }),
    );
    expect(documentClientService.getDocumentDownload).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000066',
    );
  });

  it('returns not found when admin downloads a document that is not attached', async () => {
    const company = createCompany({ status: CompanyStatus.PENDING });
    companyRepo.findOne.mockResolvedValue(company);
    verificationDocumentRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.getAdminVerificationDocumentDownload(
        mockCompanyId,
        '00000000-0000-4000-8000-000000000066',
      ),
    ).rejects.toThrow('Verification document not found');
    expect(documentClientService.getDocumentDownload).not.toHaveBeenCalled();
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
      decision: JobReviewDecision.APPROVE,
      riskLevel: JobModerationRiskLevel.LOW,
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
      decision: JobReviewDecision.APPROVE,
      riskLevel: JobModerationRiskLevel.HIGH,
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
      decision: JobReviewDecision.REJECT,
      riskLevel: JobModerationRiskLevel.HIGH,
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
      decision: JobReviewDecision.APPROVE,
      riskLevel: JobModerationRiskLevel.LOW,
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
