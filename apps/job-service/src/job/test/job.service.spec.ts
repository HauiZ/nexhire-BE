import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ERROR_CODES,
  JobExperienceLevel,
  JobStatus,
  JobType,
  JobWorkingType,
  UserRole,
} from '@nexhire/shared';
import { EventPublisher } from '@nexhire/infra';
import { DataSource, Repository } from 'typeorm';
import { CompanySnapshotService } from '../company/company-snapshot.service';
import { CompanyStatusSnapshot, CompanyTrustLevel } from '../entities/job.enum';
import { JobModerationReview } from '../entities/job-moderation-review.entity';
import { JobProcessedApplicationEvent } from '../entities/job-processed-application-event.entity';
import { JobRevision } from '../entities/job-revision.entity';
import { Job } from '../entities/job.entity';
import { JobService } from '../job.service';
import { JobModerationService } from '../moderation/job-moderation.service';
import { JobSearchTextService } from '../search/job-search-text.service';
import { JOB_SEARCH_PROVIDER } from '../search/job-search.types';

describe('JobService', () => {
  let service: JobService;
  let jobRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let eventPublisher: { publish: jest.Mock };
  let processedEventRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let manager: {
    getRepository: jest.Mock;
    increment: jest.Mock;
  };

  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    role: UserRole.RECRUITER,
    companyId: '22222222-2222-2222-2222-222222222222',
  };

  const publishedJob: Job = {
    id: '33333333-3333-3333-3333-333333333333',
    companyId: user.companyId,
    companyName: 'NexHire',
    companyLogoUrl: 'https://cdn.nexhire.vn/company/nexhire.png',
    companyStatus: CompanyStatusSnapshot.APPROVED,
    companyTrustLevel: CompanyTrustLevel.MEDIUM,
    companySnapshotAt: new Date(),
    createdByUserId: user.id,
    title: 'Backend Developer',
    description:
      'Develop and maintain REST APIs for a recruitment platform using NestJS and PostgreSQL.',
    requirements: 'At least one year of experience with Node.js and TypeScript.',
    skills: ['NestJS', 'PostgreSQL'],
    benefits: 'Hybrid work',
    categoryId: null,
    employmentType: JobType.FULL_TIME,
    workingType: JobWorkingType.HYBRID,
    experienceLevel: JobExperienceLevel.JUNIOR,
    location: 'Ha Noi',
    salaryMin: 15_000_000,
    salaryMax: 25_000_000,
    salaryCurrency: 'VND',
    isSalaryVisible: true,
    deadline: null,
    numberOfOpenings: 3,
    status: JobStatus.PUBLISHED,
    version: 1,
    applicationCount: 0,
    publishedAt: new Date(),
    closedAt: null,
    expiresAt: null,
    riskScore: null,
    riskLevel: null,
    moderationDecision: null,
    moderationReasons: [],
    moderationMatchedRules: [],
    reviewedByUserId: null,
    reviewedAt: null,
    reviewReason: null,
    unpublishedByUserId: null,
    unpublishedAt: null,
    unpublishReason: null,
    searchTitle: 'backend developer',
    searchDescription:
      'develop and maintain rest apis for a recruitment platform using nestjs and postgresql',
    searchRequirements: 'at least one year of experience with node.js and typescript',
    searchSkills: 'nestjs postgresql',
    searchCompanyName: 'nexhire',
    searchLocation: 'ha noi',
    searchText:
      'backend developer develop and maintain rest apis for a recruitment platform using nestjs and postgresql at least one year of experience with node.js and typescript nestjs postgresql nexhire ha noi',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    jobRepo = {
      findOne: jest.fn(),
      save: jest.fn((job: Job) => Promise.resolve(job)),
      createQueryBuilder: jest.fn(),
    };
    eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    processedEventRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(),
    };
    manager = {
      getRepository: jest.fn().mockReturnValue(processedEventRepo),
      increment: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        JobService,
        {
          provide: DataSource,
          useValue: { transaction: jest.fn((callback) => callback(manager)) },
        },
        { provide: CompanySnapshotService, useValue: {} },
        { provide: JobModerationService, useValue: {} },
        {
          provide: JOB_SEARCH_PROVIDER,
          useValue: { searchPublicJobs: jest.fn(), searchCompanyJobs: jest.fn() },
        },
        JobSearchTextService,
        { provide: EventPublisher, useValue: eventPublisher },
        { provide: getRepositoryToken(Job), useValue: jobRepo },
        { provide: getRepositoryToken(JobRevision), useValue: {} },
        { provide: getRepositoryToken(JobModerationReview), useValue: {} },
        { provide: getRepositoryToken(JobProcessedApplicationEvent), useValue: processedEventRepo },
      ],
    }).compile();

    service = moduleRef.get(JobService);
  });

  it('blocks major direct updates to published jobs even before applications exist', async () => {
    jobRepo.findOne.mockResolvedValue({ ...publishedJob, applicationCount: 0 });

    await expect(
      service.updateMine(user, publishedJob.id, {
        title: 'Senior Backend Developer',
        description: publishedJob.description,
        requirements: publishedJob.requirements,
        skills: publishedJob.skills,
        benefits: publishedJob.benefits ?? undefined,
        categoryId: publishedJob.categoryId ?? undefined,
        employmentType: publishedJob.employmentType,
        workingType: publishedJob.workingType,
        experienceLevel: publishedJob.experienceLevel,
        location: publishedJob.location,
        salaryMin: publishedJob.salaryMin ?? undefined,
        salaryMax: publishedJob.salaryMax ?? undefined,
        salaryCurrency: publishedJob.salaryCurrency,
        isSalaryVisible: publishedJob.isSalaryVisible,
        deadline: undefined,
        numberOfOpenings: publishedJob.numberOfOpenings ?? undefined,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.JOB.MAJOR_UPDATE_REQUIRES_REVIEW,
      }),
    });
  });

  it('increments application count when an application submitted event arrives', async () => {
    await service.recordApplicationSubmitted({
      applicationId: '44444444-4444-4444-4444-444444444444',
      jobId: publishedJob.id,
      candidateId: '55555555-5555-5555-5555-555555555555',
    });

    expect(processedEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: '44444444-4444-4444-4444-444444444444',
        jobId: publishedJob.id,
      }),
    );
    expect(manager.increment).toHaveBeenCalledWith(
      Job,
      { id: publishedJob.id },
      'applicationCount',
      1,
    );
  });

  it('returns an application snapshot for apply checks', async () => {
    jobRepo.findOne.mockResolvedValue({ ...publishedJob });

    const result = await service.getApplicationSnapshot(publishedJob.id);

    expect(jobRepo.findOne).toHaveBeenCalledWith({ where: { id: publishedJob.id } });
    expect(result).toEqual(
      expect.objectContaining({
        id: publishedJob.id,
        companyId: publishedJob.companyId,
        companyName: publishedJob.companyName,
        companyLogoUrl: publishedJob.companyLogoUrl,
        title: publishedJob.title,
        status: JobStatus.PUBLISHED,
        isApplyable: true,
      }),
    );
  });

  it('marks an application snapshot as not applyable when the job is unpublished', async () => {
    jobRepo.findOne.mockResolvedValue({ ...publishedJob, status: JobStatus.UNPUBLISHED });

    const result = await service.getApplicationSnapshot(publishedJob.id);

    expect(result.isApplyable).toBe(false);
  });

  it('does not increment application count for duplicate submitted events', async () => {
    processedEventRepo.findOne.mockResolvedValue({
      applicationId: '44444444-4444-4444-4444-444444444444',
    });

    await service.recordApplicationSubmitted({
      applicationId: '44444444-4444-4444-4444-444444444444',
      jobId: publishedJob.id,
      candidateId: '55555555-5555-5555-5555-555555555555',
    });

    expect(manager.increment).not.toHaveBeenCalled();
  });

  it('closes a published job and publishes job.closed', async () => {
    jobRepo.findOne.mockResolvedValue({ ...publishedJob });

    const result = await service.closeMine(user, publishedJob.id, { reason: 'Position filled' });

    expect(jobRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: JobStatus.CLOSED,
        closedAt: expect.any(Date),
        reviewedByUserId: user.id,
        reviewReason: 'Position filled',
        unpublishedByUserId: user.id,
        unpublishedAt: expect.any(Date),
        unpublishReason: 'Position filled',
      }),
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'job.closed',
      expect.objectContaining({
        jobId: publishedJob.id,
        companyId: publishedJob.companyId,
        reason: 'Position filled',
      }),
    );
    expect(result.status).toBe(JobStatus.CLOSED);
  });

  it('expires published jobs whose deadline has passed', async () => {
    const execute = jest.fn().mockResolvedValue({ affected: 2 });
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute,
    };
    jobRepo.createQueryBuilder.mockReturnValue(qb);
    const referenceDate = new Date('2026-07-16T00:00:00.000Z');

    const result = await service.expirePublishedJobs(referenceDate);

    expect(qb.update).toHaveBeenCalledWith(Job);
    expect(qb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: JobStatus.EXPIRED,
        unpublishedAt: referenceDate,
        unpublishReason: 'Job deadline expired',
      }),
    );
    expect(qb.where).toHaveBeenCalledWith('status = :status', { status: JobStatus.PUBLISHED });
    expect(qb.andWhere).toHaveBeenCalledWith('deadline <= :referenceDate', { referenceDate });
    expect(result).toBe(2);
  });
});
