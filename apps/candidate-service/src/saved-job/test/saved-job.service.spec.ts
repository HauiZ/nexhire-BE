import { ConflictException } from '@nestjs/common';
import { JobExperienceLevel, JobStatus, UserRole } from '@nexhire/shared';
import { Repository } from 'typeorm';
import { CandidateProfile } from '../../candidate/entities/candidate-profile.entity';
import { CandidateProfileVisibility } from '../../candidate/entities/candidate.enum';
import { SavedJob } from '../entities/saved-job.entity';
import { JobSnapshotClient, SavedJobSnapshot } from '../job-snapshot.client';
import { SavedJobService } from '../saved-job.service';

type MockRepo<T> = {
  create: jest.Mock;
  delete: jest.Mock;
  exist: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function createRepo<T>(): MockRepo<T> {
  return {
    create: jest.fn((value) => value),
    delete: jest.fn().mockResolvedValue(undefined),
    exist: jest.fn(),
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

function createSnapshot(overrides: Partial<SavedJobSnapshot> = {}): SavedJobSnapshot {
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
    publishedAt: '2026-07-16T00:00:00.000Z',
    isPublic: true,
    ...overrides,
  };
}

describe('SavedJobService', () => {
  const user = { id: 'user-1', role: UserRole.CANDIDATE };
  let service: SavedJobService;
  let candidateRepo: MockRepo<CandidateProfile>;
  let savedJobRepo: MockRepo<SavedJob>;
  let jobSnapshotClient: { getSavedSnapshot: jest.Mock };

  beforeEach(() => {
    candidateRepo = createRepo<CandidateProfile>();
    savedJobRepo = createRepo<SavedJob>();
    jobSnapshotClient = { getSavedSnapshot: jest.fn() };
    service = new SavedJobService(
      jobSnapshotClient as unknown as JobSnapshotClient,
      candidateRepo as unknown as Repository<CandidateProfile>,
      savedJobRepo as unknown as Repository<SavedJob>,
    );
  });

  it('saves a published job snapshot for the current candidate', async () => {
    candidateRepo.findOne.mockResolvedValue(createCandidate());
    savedJobRepo.findOne.mockResolvedValue(null);
    jobSnapshotClient.getSavedSnapshot.mockResolvedValue(createSnapshot());
    savedJobRepo.save.mockImplementation((value) =>
      Promise.resolve({
        id: 'saved-1',
        createdAt: new Date('2026-07-16T01:00:00.000Z'),
        updatedAt: new Date('2026-07-16T01:00:00.000Z'),
        ...value,
      }),
    );

    const result = await service.saveMine(user, '33333333-3333-3333-3333-333333333333');

    expect(jobSnapshotClient.getSavedSnapshot).toHaveBeenCalledWith(
      '33333333-3333-3333-3333-333333333333',
    );
    expect(savedJobRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        candidateUserId: 'user-1',
        jobId: '33333333-3333-3333-3333-333333333333',
        jobTitle: 'Backend Developer',
        jobStatus: JobStatus.PUBLISHED,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        jobId: '33333333-3333-3333-3333-333333333333',
        title: 'Backend Developer',
        status: JobStatus.PUBLISHED,
      }),
    );
  });

  it('returns an existing saved job without calling job-service again', async () => {
    candidateRepo.findOne.mockResolvedValue(createCandidate());
    savedJobRepo.findOne.mockResolvedValue({
      id: 'saved-1',
      candidateId: 'candidate-1',
      candidateUserId: 'user-1',
      jobId: 'job-1',
      jobTitle: 'Backend Developer',
      companyId: 'company-1',
      companyName: 'NexHire',
      companyLogoUrl: null,
      jobStatus: JobStatus.PUBLISHED,
      experienceLevel: JobExperienceLevel.JUNIOR,
      location: 'Ha Noi',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: 'VND',
      isSalaryVisible: true,
      deadline: null,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SavedJob);

    const result = await service.saveMine(user, 'job-1');

    expect(jobSnapshotClient.getSavedSnapshot).not.toHaveBeenCalled();
    expect(result.id).toBe('saved-1');
  });

  it('returns existing saved job when concurrent save hits unique constraint', async () => {
    const existing = {
      id: 'saved-1',
      candidateId: 'candidate-1',
      candidateUserId: 'user-1',
      jobId: '33333333-3333-3333-3333-333333333333',
      jobTitle: 'Backend Developer',
      companyId: 'company-1',
      companyName: 'NexHire',
      companyLogoUrl: null,
      jobStatus: JobStatus.PUBLISHED,
      experienceLevel: JobExperienceLevel.JUNIOR,
      location: 'Ha Noi',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: 'VND',
      isSalaryVisible: true,
      deadline: null,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SavedJob;
    candidateRepo.findOne.mockResolvedValue(createCandidate());
    savedJobRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    jobSnapshotClient.getSavedSnapshot.mockResolvedValue(createSnapshot());
    savedJobRepo.save.mockRejectedValue({ code: '23505' });

    const result = await service.saveMine(user, '33333333-3333-3333-3333-333333333333');

    expect(result.id).toBe('saved-1');
    expect(savedJobRepo.findOne).toHaveBeenLastCalledWith({
      where: {
        candidateId: 'candidate-1',
        jobId: '33333333-3333-3333-3333-333333333333',
      },
    });
  });

  it('rejects saving a job that is no longer public', async () => {
    candidateRepo.findOne.mockResolvedValue(createCandidate());
    savedJobRepo.findOne.mockResolvedValue(null);
    jobSnapshotClient.getSavedSnapshot.mockResolvedValue(
      createSnapshot({ status: JobStatus.EXPIRED, isPublic: false }),
    );

    await expect(service.saveMine(user, 'job-1')).rejects.toBeInstanceOf(ConflictException);
    expect(savedJobRepo.save).not.toHaveBeenCalled();
  });

  it('unsaves a job idempotently', async () => {
    const result = await service.unsaveMine(user, 'job-1');

    expect(savedJobRepo.delete).toHaveBeenCalledWith({
      candidateUserId: 'user-1',
      jobId: 'job-1',
    });
    expect(result).toEqual({ deleted: true });
  });

  it('batch-checks saved job ids in one query', async () => {
    const getRawMany = jest.fn().mockResolvedValue([{ jobId: 'job-1' }, { jobId: 'job-3' }]);
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany,
    };
    savedJobRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getMineBatchStatus(user, ['job-1', 'job-2', 'job-1', 'job-3']);

    expect(qb.where).toHaveBeenCalledWith('savedJob.candidateUserId = :candidateUserId', {
      candidateUserId: 'user-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('savedJob.jobId IN (:...jobIds)', {
      jobIds: ['job-1', 'job-2', 'job-3'],
    });
    expect(result).toEqual({ savedJobIds: ['job-1', 'job-3'] });
  });
});
