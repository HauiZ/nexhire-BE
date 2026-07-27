import { ConflictException } from '@nestjs/common';
import { CompanyStatus, JobExperienceLevel, JobStatus, UserRole } from '@nexhire/shared';
import { Repository } from 'typeorm';
import { CandidateProfile } from '../../candidate/entities/candidate-profile.entity';
import { CandidateProfileVisibility } from '../../candidate/entities/candidate.enum';
import { DocumentClientService } from '../../document-client/document-client.service';
import { JobSnapshotClient, SavedJobSnapshot } from '../../saved-job/job-snapshot.client';
import { CompanyFollowSnapshot, CompanySnapshotClient } from '../company-snapshot.client';
import { FollowedCompany } from '../entities/followed-company.entity';
import { FollowedCompanyEventPublisher } from '../followed-company-event.publisher';
import { FollowedCompanyService } from '../followed-company.service';

type MockRepo = {
  create: jest.Mock;
  delete: jest.Mock;
  exist: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function createRepo(): MockRepo {
  return {
    create: jest.fn((value) => value),
    delete: jest.fn().mockResolvedValue(undefined),
    exist: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((value) => Promise.resolve(value)),
    createQueryBuilder: jest.fn(),
  };
}

function createCandidate(): CandidateProfile {
  return {
    id: 'candidate-1',
    userId: 'user-1',
    fullName: null,
    phone: null,
    contactEmail: null,
    avatarDocumentId: null,
    headline: null,
    summary: null,
    location: null,
    portfolioUrl: null,
    linkedinUrl: null,
    openToWork: true,
    visibility: CandidateProfileVisibility.PUBLIC,
    createdAt: new Date(),
    updatedAt: new Date(),
    skills: [],
    educations: [],
    experiences: [],
    certifications: [],
    projects: [],
    cvs: [],
  };
}

function createCompanySnapshot(
  overrides: Partial<CompanyFollowSnapshot> = {},
): CompanyFollowSnapshot {
  return {
    companyId: '22222222-2222-2222-2222-222222222222',
    ownerUserId: 'owner-1',
    companyName: 'NexHire',
    companyLogoUrl: 'https://cdn.nexhire.vn/company/nexhire.png',
    companyLogoDocumentId: null,
    companyStatus: CompanyStatus.APPROVED,
    ...overrides,
  };
}

function createJobSnapshot(overrides: Partial<SavedJobSnapshot> = {}): SavedJobSnapshot {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    companyId: '22222222-2222-2222-2222-222222222222',
    companyName: 'NexHire',
    companyLogoUrl: 'https://cdn.nexhire.vn/company/nexhire.png',
    companyLogoDocumentId: null,
    title: 'Backend Developer',
    status: JobStatus.PUBLISHED,
    experienceLevel: JobExperienceLevel.JUNIOR,
    location: 'Ha Noi',
    salaryMin: 15_000_000,
    salaryMax: 25_000_000,
    salaryCurrency: 'VND',
    isSalaryVisible: true,
    deadline: '2026-12-31T00:00:00.000Z',
    publishedAt: '2026-07-27T00:00:00.000Z',
    isPublic: true,
    ...overrides,
  };
}

describe('FollowedCompanyService', () => {
  const user = { id: 'user-1', role: UserRole.CANDIDATE };
  let service: FollowedCompanyService;
  let candidateRepo: MockRepo;
  let followedCompanyRepo: MockRepo;
  let companySnapshotClient: { getPostingSnapshot: jest.Mock };
  let documentClientService: { createDownloadUrl: jest.Mock };
  let jobSnapshotClient: { getSavedSnapshot: jest.Mock };
  let eventPublisher: { publishJobPublished: jest.Mock };

  beforeEach(() => {
    candidateRepo = createRepo();
    followedCompanyRepo = createRepo();
    companySnapshotClient = { getPostingSnapshot: jest.fn() };
    documentClientService = { createDownloadUrl: jest.fn() };
    jobSnapshotClient = { getSavedSnapshot: jest.fn() };
    eventPublisher = { publishJobPublished: jest.fn() };
    service = new FollowedCompanyService(
      companySnapshotClient as unknown as CompanySnapshotClient,
      documentClientService as unknown as DocumentClientService,
      jobSnapshotClient as unknown as JobSnapshotClient,
      eventPublisher as unknown as FollowedCompanyEventPublisher,
      candidateRepo as unknown as Repository<CandidateProfile>,
      followedCompanyRepo as unknown as Repository<FollowedCompany>,
    );
  });

  it('resolves company logo document URL when returning follow records', async () => {
    candidateRepo.findOne.mockResolvedValue(createCandidate());
    followedCompanyRepo.findOne.mockResolvedValue(null);
    companySnapshotClient.getPostingSnapshot.mockResolvedValue(
      createCompanySnapshot({
        companyLogoUrl: null,
        companyLogoDocumentId: '99999999-9999-9999-9999-999999999999',
      }),
    );
    documentClientService.createDownloadUrl.mockResolvedValue({
      url: 'https://storage.local/company-logo.png',
      expiresInSeconds: 3600,
    });
    followedCompanyRepo.save.mockImplementation((value) =>
      Promise.resolve({
        id: 'follow-1',
        createdAt: new Date('2026-07-27T01:00:00.000Z'),
        updatedAt: new Date('2026-07-27T01:00:00.000Z'),
        ...value,
      }),
    );

    const result = await service.followMine(user, '22222222-2222-2222-2222-222222222222');

    expect(documentClientService.createDownloadUrl).toHaveBeenCalledWith(
      '99999999-9999-9999-9999-999999999999',
    );
    expect(result.companyLogoUrl).toBe('https://storage.local/company-logo.png');
  });

  it('follows an approved company snapshot for the current candidate', async () => {
    candidateRepo.findOne.mockResolvedValue(createCandidate());
    followedCompanyRepo.findOne.mockResolvedValue(null);
    companySnapshotClient.getPostingSnapshot.mockResolvedValue(createCompanySnapshot());
    followedCompanyRepo.save.mockImplementation((value) =>
      Promise.resolve({
        id: 'follow-1',
        createdAt: new Date('2026-07-27T01:00:00.000Z'),
        updatedAt: new Date('2026-07-27T01:00:00.000Z'),
        ...value,
      }),
    );

    const result = await service.followMine(user, '22222222-2222-2222-2222-222222222222');

    expect(companySnapshotClient.getPostingSnapshot).toHaveBeenCalledWith(
      '22222222-2222-2222-2222-222222222222',
    );
    expect(followedCompanyRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        candidateUserId: 'user-1',
        companyId: '22222222-2222-2222-2222-222222222222',
        companyName: 'NexHire',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        companyId: '22222222-2222-2222-2222-222222222222',
        companyName: 'NexHire',
      }),
    );
  });

  it('rejects following a non-approved company', async () => {
    candidateRepo.findOne.mockResolvedValue(createCandidate());
    followedCompanyRepo.findOne.mockResolvedValue(null);
    companySnapshotClient.getPostingSnapshot.mockResolvedValue(
      createCompanySnapshot({ companyStatus: CompanyStatus.PENDING }),
    );

    await expect(service.followMine(user, 'company-1')).rejects.toBeInstanceOf(ConflictException);
    expect(followedCompanyRepo.save).not.toHaveBeenCalled();
  });

  it('batch-checks followed company ids in one query', async () => {
    const getRawMany = jest
      .fn()
      .mockResolvedValue([{ companyId: 'company-1' }, { companyId: 'company-3' }]);
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany,
    };
    followedCompanyRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getMineBatchStatus(user, [
      'company-1',
      'company-2',
      'company-1',
      'company-3',
    ]);

    expect(qb.andWhere).toHaveBeenCalledWith('followedCompany.companyId IN (:...companyIds)', {
      companyIds: ['company-1', 'company-2', 'company-3'],
    });
    expect(result).toEqual({ followedCompanyIds: ['company-1', 'company-3'] });
  });

  it('publishes one notification event for followers when a followed company job is public', async () => {
    followedCompanyRepo.find.mockResolvedValue([
      { candidateUserId: 'user-1' },
      { candidateUserId: 'user-2' },
      { candidateUserId: 'user-1' },
    ]);
    jobSnapshotClient.getSavedSnapshot.mockResolvedValue(createJobSnapshot());

    await service.notifyFollowersAboutPublishedJob({
      jobId: '33333333-3333-3333-3333-333333333333',
      companyId: '22222222-2222-2222-2222-222222222222',
      publishedAt: '2026-07-27T00:00:00.000Z',
    });

    expect(eventPublisher.publishJobPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: '33333333-3333-3333-3333-333333333333',
        candidateUserIds: ['user-1', 'user-2'],
      }),
    );
  });
});
