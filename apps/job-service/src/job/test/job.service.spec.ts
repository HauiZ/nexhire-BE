import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { REDIS_CLIENT } from '@nexhire/infra';
import {
  ERROR_CODES,
  JobExperienceLevel,
  JobModerationDecision,
  JobModerationRiskLevel,
  JobRevisionStatus,
  JobReviewDecision,
  JobStatus,
  JobType,
  JobWorkingType,
  UserRole,
} from '@nexhire/shared';
import { DataSource } from 'typeorm';
import { CompanySnapshotService } from '../company/company-snapshot.service';
import {
  CompanyStatusSnapshot,
  CompanyTrustLevel,
  JobModerationTargetType,
} from '../entities/job.enum';
import { JobModerationReview } from '../entities/job-moderation-review.entity';
import { JobProcessedApplicationEvent } from '../entities/job-processed-application-event.entity';
import { JobRevision } from '../entities/job-revision.entity';
import { Job } from '../entities/job.entity';
import { CompanyPostingSnapshot } from '../entities/company-posting-snapshot.entity';
import { JobEventPublisher } from '../events/job-event.publisher';
import { JobService } from '../job.service';
import { JobModerationService } from '../moderation/job-moderation.service';
import { PublicJobQueryDto, RecruiterJobRevisionQueryDto } from '../dto/job-query.dto';
import { UpdateJobDto } from '../dto/job-input.dto';
import { JobSearchTextService } from '../search/job-search-text.service';
import { JOB_SEARCH_PROVIDER } from '../search/job-search.types';
import { DocumentClientService } from '../../document-client/document-client.service';

describe('JobService', () => {
  let service: JobService;
  let jobRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
  };
  let revisionRepo: {
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
    findAndCount: jest.Mock;
  };
  let moderationReviewRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let companySnapshotService: {
    getPostingSnapshot: jest.Mock;
  };
  let moderationService: {
    moderate: jest.Mock;
  };
  let jobSearchProvider: {
    searchPublicJobs: jest.Mock;
    searchPublicCompanyJobs: jest.Mock;
    searchCompanyJobs: jest.Mock;
  };
  let jobEventPublisher: {
    publishJobPublished: jest.Mock;
    publishRevisionApproved: jest.Mock;
    publishJobReviewRequired: jest.Mock;
    publishJobRevisionReviewRequired: jest.Mock;
    publishJobReviewResultChanged: jest.Mock;
    publishJobRevisionReviewResultChanged: jest.Mock;
    publishJobUnpublished: jest.Mock;
    publishJobClosed: jest.Mock;
    publishReviewTrustSignal: jest.Mock;
  };
  let documentClientService: {
    createDownloadUrl: jest.Mock;
  };
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    incr: jest.Mock;
  };
  let processedEventRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
    save: jest.Mock;
  };
  let companyPostingSnapshotRepo: {
    upsert: jest.Mock;
  };
  let manager: {
    getRepository: jest.Mock;
    increment: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    find: jest.Mock;
    findOneByOrFail: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    role: UserRole.RECRUITER,
    companyId: '22222222-2222-2222-2222-222222222222',
  };
  const admin = {
    id: '99999999-9999-9999-9999-999999999999',
    role: UserRole.ADMIN,
  };

  const publishedJob: Job = {
    id: '33333333-3333-3333-3333-333333333333',
    companyId: user.companyId,
    companyName: 'NexHire',
    companyLogoUrl: 'https://cdn.nexhire.vn/company/nexhire.png',
    companyLogoDocumentId: null,
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
    moderationPolicyId: null,
    moderationPolicyVersion: null,
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

  const jobInput = (overrides: Partial<Job> = {}): UpdateJobDto => ({
    title: overrides.title ?? publishedJob.title ?? undefined,
    description: overrides.description ?? publishedJob.description ?? undefined,
    requirements: overrides.requirements ?? publishedJob.requirements ?? undefined,
    skills: overrides.skills ?? publishedJob.skills ?? undefined,
    benefits: overrides.benefits ?? publishedJob.benefits ?? undefined,
    categoryId: overrides.categoryId ?? publishedJob.categoryId ?? undefined,
    employmentType: overrides.employmentType ?? publishedJob.employmentType ?? undefined,
    workingType: overrides.workingType ?? publishedJob.workingType ?? undefined,
    experienceLevel: overrides.experienceLevel ?? publishedJob.experienceLevel ?? undefined,
    location: overrides.location ?? publishedJob.location ?? undefined,
    salaryMin: overrides.salaryMin ?? publishedJob.salaryMin ?? undefined,
    salaryMax: overrides.salaryMax ?? publishedJob.salaryMax ?? undefined,
    salaryCurrency: overrides.salaryCurrency ?? publishedJob.salaryCurrency ?? undefined,
    isSalaryVisible: overrides.isSalaryVisible ?? publishedJob.isSalaryVisible ?? undefined,
    deadline: overrides.deadline ?? undefined,
    numberOfOpenings: overrides.numberOfOpenings ?? publishedJob.numberOfOpenings ?? undefined,
  });

  const majorRevision = (overrides: Partial<JobRevision> = {}): JobRevision => ({
    id: '66666666-6666-6666-6666-666666666666',
    jobId: publishedJob.id,
    job: publishedJob,
    companyId: publishedJob.companyId,
    createdByUserId: user.id,
    status: JobRevisionStatus.DRAFT,
    title: 'Principal Backend Developer',
    description: publishedJob.description,
    requirements: publishedJob.requirements,
    skills: ['NestJS', 'PostgreSQL', 'Kafka'],
    benefits: publishedJob.benefits,
    categoryId: publishedJob.categoryId,
    employmentType: publishedJob.employmentType,
    workingType: publishedJob.workingType,
    experienceLevel: JobExperienceLevel.LEAD,
    location: publishedJob.location,
    salaryMin: 50_000_000,
    salaryMax: 80_000_000,
    salaryCurrency: 'VND',
    isSalaryVisible: true,
    deadline: null,
    numberOfOpenings: 1,
    changeSummary: 'Upgrade role scope',
    riskScore: null,
    riskLevel: null,
    moderationDecision: null,
    moderationReasons: [],
    moderationMatchedRules: [],
    moderationPolicyId: null,
    moderationPolicyVersion: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(async () => {
    jobRepo = {
      findOne: jest.fn(),
      save: jest.fn((job: Job) => Promise.resolve(job)),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
      create: jest.fn((value) => value),
    };
    revisionRepo = {
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((revision: JobRevision) => Promise.resolve(revision)),
      create: jest.fn((value) => value),
      find: jest.fn(),
      findAndCount: jest.fn(),
    };
    moderationReviewRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    companySnapshotService = {
      getPostingSnapshot: jest.fn(),
    };
    moderationService = {
      moderate: jest.fn(),
    };
    jobSearchProvider = {
      searchPublicJobs: jest.fn(),
      searchPublicCompanyJobs: jest.fn(),
      searchCompanyJobs: jest.fn(),
    };
    jobEventPublisher = {
      publishJobPublished: jest.fn().mockResolvedValue(undefined),
      publishRevisionApproved: jest.fn().mockResolvedValue(undefined),
      publishJobReviewRequired: jest.fn().mockResolvedValue(undefined),
      publishJobRevisionReviewRequired: jest.fn().mockResolvedValue(undefined),
      publishJobReviewResultChanged: jest.fn().mockResolvedValue(undefined),
      publishJobRevisionReviewResultChanged: jest.fn().mockResolvedValue(undefined),
      publishJobUnpublished: jest.fn().mockResolvedValue(undefined),
      publishJobClosed: jest.fn().mockResolvedValue(undefined),
      publishReviewTrustSignal: jest.fn().mockResolvedValue(undefined),
    };
    documentClientService = {
      createDownloadUrl: jest.fn(),
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(1),
    };
    processedEventRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      createQueryBuilder: jest.fn(),
      save: jest.fn(),
    };
    companyPostingSnapshotRepo = {
      upsert: jest.fn().mockResolvedValue(undefined),
    };
    manager = {
      getRepository: jest.fn((entity) => {
        if (entity === JobModerationReview) {
          return moderationReviewRepo;
        }
        if (entity === CompanyPostingSnapshot) {
          return companyPostingSnapshotRepo;
        }
        return processedEventRepo;
      }),
      increment: jest.fn(),
      save: jest.fn((entityOrTarget, maybeEntity) =>
        Promise.resolve(maybeEntity ?? entityOrTarget),
      ),
      update: jest.fn(),
      find: jest.fn(),
      findOneByOrFail: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        JobService,
        {
          provide: DataSource,
          useValue: { transaction: jest.fn((callback) => callback(manager)) },
        },
        { provide: CompanySnapshotService, useValue: companySnapshotService },
        { provide: JobModerationService, useValue: moderationService },
        {
          provide: JOB_SEARCH_PROVIDER,
          useValue: jobSearchProvider,
        },
        JobSearchTextService,
        { provide: JobEventPublisher, useValue: jobEventPublisher },
        { provide: DocumentClientService, useValue: documentClientService },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: getRepositoryToken(Job), useValue: jobRepo },
        { provide: getRepositoryToken(JobRevision), useValue: revisionRepo },
        { provide: getRepositoryToken(JobModerationReview), useValue: moderationReviewRepo },
        { provide: getRepositoryToken(JobProcessedApplicationEvent), useValue: processedEventRepo },
        {
          provide: getRepositoryToken(CompanyPostingSnapshot),
          useValue: companyPostingSnapshotRepo,
        },
      ],
    }).compile();

    service = moduleRef.get(JobService);
  });

  it('blocks major direct updates to published jobs even before applications exist', async () => {
    jobRepo.findOne.mockResolvedValue({ ...publishedJob, applicationCount: 0 });

    await expect(
      service.updateMine(user, publishedJob.id, jobInput({ title: 'Senior Backend Developer' })),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.JOB.MAJOR_UPDATE_REQUIRES_REVIEW,
      }),
    });
  });

  it('treats skills changes as major direct updates on published jobs', async () => {
    jobRepo.findOne.mockResolvedValue({ ...publishedJob, applicationCount: 0 });

    await expect(
      service.updateMine(
        user,
        publishedJob.id,
        jobInput({ skills: ['NestJS', 'PostgreSQL', 'AWS'] }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.JOB.MAJOR_UPDATE_REQUIRES_REVIEW,
      }),
    });
  });

  it('submits a draft through moderation and records the review recommendation', async () => {
    const draft = { ...publishedJob, status: JobStatus.DRAFT, publishedAt: null };
    const snapshotDate = new Date('2026-07-16T00:00:00.000Z');
    jobRepo.findOne.mockResolvedValue(draft);
    companySnapshotService.getPostingSnapshot.mockResolvedValue({
      companyId: publishedJob.companyId,
      companyName: 'NexHire Updated',
      companyLogoUrl: 'https://cdn.nexhire.vn/company/new-logo.png',
      companyStatus: CompanyStatusSnapshot.APPROVED,
      companyTrustLevel: CompanyTrustLevel.LOW,
      snapshotAt: snapshotDate,
    });
    moderationService.moderate.mockReturnValue({
      decision: JobModerationDecision.NEEDS_REVIEW,
      riskScore: 45,
      riskLevel: JobModerationRiskLevel.MEDIUM,
      reasons: ['External form requires admin review'],
      matchedRules: ['RISK_EXTERNAL_FORM'],
    });

    const result = await service.submitMine(user, publishedJob.id);

    expect(companySnapshotService.getPostingSnapshot).toHaveBeenCalledWith(user);
    expect(moderationService.moderate).toHaveBeenCalledWith(
      expect.objectContaining({ id: publishedJob.id }),
      expect.objectContaining({ companyTrustLevel: CompanyTrustLevel.LOW }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      Job,
      expect.objectContaining({
        status: JobStatus.NEEDS_REVIEW,
        companyName: 'NexHire Updated',
        companyLogoUrl: 'https://cdn.nexhire.vn/company/new-logo.png',
        companyTrustLevel: CompanyTrustLevel.LOW,
        riskScore: 45,
        riskLevel: JobModerationRiskLevel.MEDIUM,
        moderationDecision: JobModerationDecision.NEEDS_REVIEW,
      }),
    );
    expect(moderationReviewRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: publishedJob.id,
        targetType: JobModerationTargetType.JOB,
        targetId: publishedJob.id,
        riskScore: 45,
        riskLevel: JobModerationRiskLevel.MEDIUM,
        decision: JobModerationDecision.NEEDS_REVIEW,
      }),
    );
    expect(result.status).toBe(JobStatus.NEEDS_REVIEW);
    expect(jobEventPublisher.publishJobReviewRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: publishedJob.id,
        companyId: publishedJob.companyId,
        title: publishedJob.title,
        status: JobStatus.NEEDS_REVIEW,
        version: publishedJob.version,
        riskScore: 45,
        riskLevel: JobModerationRiskLevel.MEDIUM,
      }),
    );
  });

  it('returns company job counts for every status', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { status: JobStatus.PUBLISHED, count: '4' },
        { status: JobStatus.DRAFT, count: '2' },
      ]),
    };
    jobRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getCompanyStatusCounts(user);

    expect(qb.where).toHaveBeenCalledWith('job.companyId = :companyId', {
      companyId: user.companyId,
    });
    expect(result).toEqual(
      expect.objectContaining({
        DRAFT: 2,
        PUBLISHED: 4,
        PENDING_REVIEW: 0,
        EXPIRED: 0,
      }),
    );
  });

  it('approves a reviewed job, publishes public event, and emits trust signal', async () => {
    const reviewable = {
      ...publishedJob,
      status: JobStatus.PENDING_REVIEW,
      publishedAt: null,
      riskScore: 5,
      riskLevel: JobModerationRiskLevel.LOW,
    };
    const moderationReview = {
      jobId: publishedJob.id,
      targetId: publishedJob.id,
      reviewedByUserId: null,
      reviewedAt: null,
      adminDecision: null,
      adminReason: null,
    };
    jobRepo.findOne.mockResolvedValue(reviewable);
    moderationReviewRepo.findOne.mockResolvedValue(moderationReview);

    const result = await service.reviewJob(admin, publishedJob.id, {
      decision: JobReviewDecision.APPROVE,
      reason: 'Looks legitimate',
    });

    expect(result.status).toBe(JobStatus.PUBLISHED);
    expect(jobRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: JobStatus.PUBLISHED,
        reviewedByUserId: admin.id,
        reviewReason: 'Looks legitimate',
        publishedAt: expect.any(Date),
      }),
    );
    expect(moderationReviewRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewedByUserId: admin.id,
        adminDecision: JobReviewDecision.APPROVE,
        adminReason: 'Looks legitimate',
      }),
    );
    expect(jobEventPublisher.publishJobPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: publishedJob.id,
        companyId: publishedJob.companyId,
      }),
    );
    expect(jobEventPublisher.publishJobReviewResultChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: publishedJob.id,
        companyId: publishedJob.companyId,
        title: publishedJob.title,
        status: JobStatus.PUBLISHED,
        decision: JobReviewDecision.APPROVE,
      }),
    );
    expect(jobEventPublisher.publishReviewTrustSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: publishedJob.companyId,
        jobId: publishedJob.id,
        targetType: JobModerationTargetType.JOB,
        targetId: publishedJob.id,
        decision: JobReviewDecision.APPROVE,
        riskLevel: JobModerationRiskLevel.LOW,
      }),
    );
  });

  it('rejects a reviewed job only when admin provides a reason', async () => {
    jobRepo.findOne.mockResolvedValue({
      ...publishedJob,
      status: JobStatus.SHOULD_REJECT,
      riskLevel: JobModerationRiskLevel.CRITICAL,
    });

    await expect(
      service.reviewJob(admin, publishedJob.id, { decision: JobReviewDecision.REJECT }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.JOB.REVIEW_DECISION_REASON_REQUIRED,
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
    expect(jobEventPublisher.publishJobClosed).toHaveBeenCalledWith(
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

  it('syncs non-approved company snapshots and moves public/reviewing jobs out of public flow', async () => {
    const execute = jest.fn().mockResolvedValue({ affected: 1 });
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute,
    };
    manager.createQueryBuilder.mockReturnValue(qb);
    manager.find.mockResolvedValue([{ ...publishedJob }]);

    await service.syncCompanyPostingSnapshot({
      companyId: publishedJob.companyId,
      companyName: 'Renamed Company',
      companyLogoUrl: null,
      companyStatus: CompanyStatusSnapshot.SUSPENDED,
      companyTrustLevel: CompanyTrustLevel.LOW,
      changedAt: '2026-07-16T00:00:00.000Z',
    });

    expect(manager.update).toHaveBeenCalledWith(
      Job,
      { companyId: publishedJob.companyId },
      expect.objectContaining({
        companyName: 'Renamed Company',
        companyLogoUrl: null,
        companyStatus: CompanyStatusSnapshot.SUSPENDED,
        companyTrustLevel: CompanyTrustLevel.LOW,
      }),
    );
    expect(manager.find).toHaveBeenCalledWith(Job, {
      where: { companyId: publishedJob.companyId },
    });
    expect(manager.save).toHaveBeenCalledWith(
      Job,
      expect.arrayContaining([
        expect.objectContaining({
          searchCompanyName: 'renamed company',
        }),
      ]),
    );
    expect(qb.update).toHaveBeenCalledWith(Job);
    expect(qb.update).toHaveBeenCalledWith(JobRevision);
    expect(qb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: JobStatus.SHOULD_REJECT,
      }),
    );
    expect(qb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: JobRevisionStatus.SHOULD_REJECT,
      }),
    );
  });

  it('keeps public detail lightweight and hides moderation/internal fields', async () => {
    jobRepo.findOne.mockResolvedValue({
      ...publishedJob,
      riskScore: 80,
      riskLevel: JobModerationRiskLevel.CRITICAL,
      moderationDecision: JobModerationDecision.SHOULD_REJECT,
      moderationReasons: ['Hidden reason'],
      reviewReason: 'Hidden admin reason',
      applicationCount: 12,
    });

    const result = await service.getPublic(publishedJob.id);

    expect(result).toEqual(
      expect.objectContaining({
        id: publishedJob.id,
        title: publishedJob.title,
        companyName: publishedJob.companyName,
        description: publishedJob.description,
        requirements: publishedJob.requirements,
        skills: publishedJob.skills,
      }),
    );
    expect(result).not.toHaveProperty('moderation');
    expect(result).not.toHaveProperty('riskScore');
    expect(result).not.toHaveProperty('reviewReason');
    expect(result).not.toHaveProperty('applicationCount');
  });

  it('resolves company logo document for public job detail', async () => {
    jobRepo.findOne.mockResolvedValue({
      ...publishedJob,
      companyLogoUrl: null,
      companyLogoDocumentId: '00000000-0000-4000-8000-000000000099',
    });
    documentClientService.createDownloadUrl.mockResolvedValue({
      url: 'https://storage.local/company-logo.png',
      expiresInSeconds: 3600,
    });

    const result = await service.getPublic(publishedJob.id);

    expect(documentClientService.createDownloadUrl).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000099',
    );
    expect(result.companyLogoUrl).toBe('https://storage.local/company-logo.png');
    expect(result.companyLogoDocumentId).toBe('00000000-0000-4000-8000-000000000099');
  });

  it('lists published jobs for a public company profile through the search provider', async () => {
    const expected = {
      data: [
        {
          id: publishedJob.id,
          title: publishedJob.title,
          companyId: publishedJob.companyId,
          companyName: publishedJob.companyName,
          companyLogoUrl: publishedJob.companyLogoUrl,
          experienceLevel: publishedJob.experienceLevel,
          location: publishedJob.location,
          salaryMin: publishedJob.salaryMin,
          salaryMax: publishedJob.salaryMax,
          salaryCurrency: publishedJob.salaryCurrency,
          isSalaryVisible: publishedJob.isSalaryVisible,
          publishedAt: publishedJob.publishedAt,
        },
      ],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    const query: PublicJobQueryDto = { page: 1, limit: 10, skip: 0 };
    jobSearchProvider.searchPublicCompanyJobs.mockResolvedValue(expected);

    await expect(service.listPublicByCompany(publishedJob.companyId, query)).resolves.toBe(
      expected,
    );
    expect(jobSearchProvider.searchPublicCompanyJobs).toHaveBeenCalledWith(
      publishedJob.companyId,
      query,
    );
  });

  it('caches public job list responses by normalized query', async () => {
    const expected = {
      data: [
        {
          id: publishedJob.id,
          title: publishedJob.title,
          companyId: publishedJob.companyId,
          companyName: publishedJob.companyName,
          companyLogoUrl: publishedJob.companyLogoUrl,
          companyLogoDocumentId: publishedJob.companyLogoDocumentId,
          skills: publishedJob.skills,
          categoryId: publishedJob.categoryId,
          employmentType: publishedJob.employmentType,
          workingType: publishedJob.workingType,
          experienceLevel: publishedJob.experienceLevel,
          location: publishedJob.location,
          salaryMin: publishedJob.salaryMin,
          salaryMax: publishedJob.salaryMax,
          salaryCurrency: publishedJob.salaryCurrency,
          isSalaryVisible: publishedJob.isSalaryVisible,
          deadline: publishedJob.deadline,
          publishedAt: publishedJob.publishedAt,
        },
      ],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };
    const query: PublicJobQueryDto = { page: 1, limit: 10, skip: 0, q: 'nestjs' };
    redis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(expected));
    jobSearchProvider.searchPublicJobs.mockResolvedValue(expected);

    await expect(service.listPublic(query)).resolves.toBe(expected);
    await expect(service.listPublic({ page: 1, limit: 10, skip: 0, q: 'nestjs' })).resolves.toEqual(
      JSON.parse(JSON.stringify(expected)),
    );

    expect(jobSearchProvider.searchPublicJobs).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('job:public-cache:v0:'),
      JSON.stringify(expected),
      'EX',
      30,
    );
  });

  it('invalidates public job cache when a job is reviewed into public flow', async () => {
    const expected = {
      data: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    };
    const query: PublicJobQueryDto = { page: 1, limit: 10, skip: 0 };
    redis.get.mockResolvedValue(null);
    jobSearchProvider.searchPublicJobs.mockResolvedValue(expected);

    await service.listPublic(query);
    jobRepo.findOne.mockResolvedValue({ ...publishedJob, status: JobStatus.PENDING_REVIEW });
    jobRepo.save.mockResolvedValue({ ...publishedJob, status: JobStatus.PUBLISHED });
    await service.reviewJob(admin, publishedJob.id, { decision: JobReviewDecision.APPROVE });
    await service.listPublic(query);

    expect(jobSearchProvider.searchPublicJobs).toHaveBeenCalledTimes(2);
    expect(redis.incr).toHaveBeenCalledWith('job:public-cache:version');
  });

  it('lists all jobs for admin with filters', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[publishedJob], 1]),
    };
    jobRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listAdminJobs({
      page: 1,
      limit: 10,
      skip: 0,
      status: JobStatus.PUBLISHED,
      riskLevel: JobModerationRiskLevel.LOW,
      companyId: publishedJob.companyId,
      search: 'backend',
      sort: 'applications_desc' as never,
    });

    expect(qb.where).toHaveBeenCalledWith('"job"."deleted_at" IS NULL');
    expect(qb.andWhere).toHaveBeenCalledWith('job.status = :status', {
      status: JobStatus.PUBLISHED,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('job.riskLevel = :riskLevel', {
      riskLevel: JobModerationRiskLevel.LOW,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('job.companyId = :companyId', {
      companyId: publishedJob.companyId,
    });
    expect(result.meta.total).toBe(1);
    expect(result.data[0].id).toBe(publishedJob.id);
  });

  it('gets one admin job detail with moderation payload', async () => {
    jobRepo.findOne.mockResolvedValue(publishedJob);

    const result = await service.getAdminJob(publishedJob.id);

    expect(jobRepo.findOne).toHaveBeenCalledWith({ where: { id: publishedJob.id } });
    expect(result).toMatchObject({
      id: publishedJob.id,
      moderation: {
        riskScore: publishedJob.riskScore,
        riskLevel: publishedJob.riskLevel,
        decision: publishedJob.moderationDecision,
        reasons: publishedJob.moderationReasons,
        matchedRules: publishedJob.moderationMatchedRules,
      },
    });
  });

  it('returns JOB_NOT_FOUND for missing admin job detail', async () => {
    jobRepo.findOne.mockResolvedValue(null);

    await expect(service.getAdminJob(publishedJob.id)).rejects.toMatchObject({
      status: 404,
      response: expect.objectContaining({
        code: ERROR_CODES.JOB.JOB_NOT_FOUND,
      }),
    });
  });

  it('returns admin job overview counts', async () => {
    jobRepo.count.mockResolvedValueOnce(5);
    revisionRepo.count.mockResolvedValueOnce(2);
    const jobStatusQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { status: JobStatus.PUBLISHED, count: '3' },
        { status: JobStatus.PENDING_REVIEW, count: '1' },
        { status: JobStatus.CLOSED, count: '1' },
      ]),
    };
    const revisionStatusQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { status: JobRevisionStatus.NEEDS_REVIEW, count: '1' },
        { status: JobRevisionStatus.APPROVED, count: '1' },
      ]),
    };
    jobRepo.createQueryBuilder.mockReturnValueOnce(jobStatusQb);
    revisionRepo.createQueryBuilder.mockReturnValueOnce(revisionStatusQb);

    const result = await service.getAdminOverview();

    expect(result.totalJobs).toBe(5);
    expect(result.jobsByStatus.PUBLISHED).toBe(3);
    expect(result.jobsWaitingReview).toBe(1);
    expect(result.totalRevisions).toBe(2);
    expect(result.revisionsWaitingReview).toBe(1);
  });

  it('returns admin job growth chart buckets with application counts', async () => {
    const makeQb = (rows: unknown[]) => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    });
    jobRepo.createQueryBuilder
      .mockReturnValueOnce(makeQb([{ bucket: '2026-07-01', count: '4' }]))
      .mockReturnValueOnce(makeQb([{ bucket: '2026-07-01', count: '2' }]))
      .mockReturnValueOnce(makeQb([{ bucket: '2026-07-02', count: '1' }]))
      .mockReturnValueOnce(makeQb([{ bucket: '2026-07-02', count: '1' }]))
      .mockReturnValueOnce(makeQb([{ bucket: '2026-07-01', count: '3' }]))
      .mockReturnValueOnce(makeQb([{ bucket: '2026-07-02', count: '1' }]));
    processedEventRepo.createQueryBuilder.mockReturnValueOnce(
      makeQb([{ bucket: '2026-07-01', count: '9' }]),
    );

    const result = await service.getAdminGrowth({
      from: '2026-07-01',
      to: '2026-07-02',
      bucket: 'day' as never,
    });

    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toMatchObject({
      bucket: '2026-07-01',
      createdJobs: 4,
      publishedJobs: 2,
      reviewedJobs: 3,
      applicationsSubmitted: 9,
    });
    expect(result.points[1]).toMatchObject({
      bucket: '2026-07-02',
      unpublishedJobs: 1,
      closedJobs: 1,
      rejectedJobs: 1,
    });
  });

  it('lists revision review queue with pagination and search', async () => {
    const revision = majorRevision({ status: JobRevisionStatus.NEEDS_REVIEW });
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[revision], 1]),
    };
    revisionRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listRevisionReviewQueue({
      page: 1,
      limit: 10,
      skip: 0,
      status: JobRevisionStatus.NEEDS_REVIEW,
      search: 'backend',
    });

    expect(qb.where).toHaveBeenCalledWith('revision.status IN (:...statuses)', {
      statuses: [JobRevisionStatus.NEEDS_REVIEW],
    });
    expect(qb.andWhere).toHaveBeenCalledWith('"revision"."deleted_at" IS NULL');
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result.meta.total).toBe(1);
    expect(result.data[0].id).toBe(revision.id);
  });

  it('gets one admin revision detail with moderation payload', async () => {
    const revision = majorRevision({ status: JobRevisionStatus.NEEDS_REVIEW });
    revisionRepo.findOne.mockResolvedValue(revision);

    const result = await service.getAdminRevision(revision.id);

    expect(revisionRepo.findOne).toHaveBeenCalledWith({ where: { id: revision.id } });
    expect(result).toMatchObject({
      id: revision.id,
      moderation: {
        riskScore: revision.riskScore,
        riskLevel: revision.riskLevel,
        decision: revision.moderationDecision,
        reasons: revision.moderationReasons,
        matchedRules: revision.moderationMatchedRules,
      },
    });
  });

  it('returns REVISION_NOT_FOUND for missing admin revision detail', async () => {
    revisionRepo.findOne.mockResolvedValue(null);

    await expect(service.getAdminRevision('missing-revision')).rejects.toMatchObject({
      status: 404,
      response: expect.objectContaining({
        code: ERROR_CODES.JOB.REVISION_NOT_FOUND,
      }),
    });
  });

  it('lists featured companies from published jobs', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          companyId: publishedJob.companyId,
          companyName: publishedJob.companyName,
          companyLogoUrl: null,
          companyLogoDocumentId: '00000000-0000-4000-8000-000000000099',
          activeJobCount: '4',
          latestPublishedAt: publishedJob.publishedAt,
        },
      ]),
    };
    jobRepo.createQueryBuilder.mockReturnValue(qb);
    documentClientService.createDownloadUrl.mockResolvedValue({
      url: 'https://storage.local/company-logo.png',
      expiresInSeconds: 3600,
    });

    const result = await service.listFeaturedCompanies('8');

    expect(qb.addSelect).toHaveBeenCalledWith(
      'MAX(CAST(job.companyLogoDocumentId AS text))',
      'companyLogoDocumentId',
    );
    expect(qb.where).toHaveBeenCalledWith('job.status = :status', {
      status: JobStatus.PUBLISHED,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('"job"."deleted_at" IS NULL');
    expect(qb.limit).toHaveBeenCalledWith(8);
    expect(result).toEqual([
      {
        companyId: publishedJob.companyId,
        companyName: publishedJob.companyName,
        companyLogoUrl: 'https://storage.local/company-logo.png',
        companyLogoDocumentId: '00000000-0000-4000-8000-000000000099',
        activeJobCount: 4,
        latestPublishedAt: publishedJob.publishedAt,
      },
    ]);
  });

  it('returns public home stats from published jobs', async () => {
    const companyCountQb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ count: '6' }),
    };
    const categoryCountQb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ count: '4' }),
    };
    const expected = {
      publishedJobCount: 42,
      activeCompanyCount: 6,
      categoryCount: 4,
    };
    redis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(expected));
    jobRepo.count.mockResolvedValue(42);
    jobRepo.createQueryBuilder
      .mockReturnValueOnce(companyCountQb)
      .mockReturnValueOnce(categoryCountQb);

    await expect(service.getHomeStats()).resolves.toEqual(expected);
    await expect(service.getHomeStats()).resolves.toEqual(expected);
    expect(jobRepo.count).toHaveBeenCalledTimes(1);
    expect(jobRepo.count).toHaveBeenCalledWith({
      where: { status: JobStatus.PUBLISHED, deletedAt: expect.any(Object) },
    });
    expect(companyCountQb.andWhere).toHaveBeenCalledWith('"job"."deleted_at" IS NULL');
    expect(categoryCountQb.andWhere).toHaveBeenCalledWith('"job"."deleted_at" IS NULL');
    expect(categoryCountQb.andWhere).toHaveBeenCalledWith('job.categoryId IS NOT NULL');
  });

  it('lists major revisions for a company-owned job', async () => {
    const revision = majorRevision({ status: JobRevisionStatus.PENDING_REVIEW });
    jobRepo.findOne.mockResolvedValue(publishedJob);
    revisionRepo.findAndCount.mockResolvedValue([[revision], 1]);
    const query: RecruiterJobRevisionQueryDto = {
      page: 1,
      limit: 10,
      skip: 0,
      status: JobRevisionStatus.PENDING_REVIEW,
    };

    const result = await service.listRevisions(user, publishedJob.id, query);

    expect(jobRepo.findOne).toHaveBeenCalledWith({
      where: { id: publishedJob.id, companyId: user.companyId },
    });
    expect(revisionRepo.findAndCount).toHaveBeenCalledWith({
      where: {
        jobId: publishedJob.id,
        companyId: user.companyId,
        status: JobRevisionStatus.PENDING_REVIEW,
      },
      order: { createdAt: 'DESC' },
      skip: 0,
      take: 10,
    });
    expect(result.data).toEqual([
      expect.objectContaining({
        id: revision.id,
        jobId: publishedJob.id,
        status: JobRevisionStatus.PENDING_REVIEW,
      }),
    ]);
    expect(result.meta.total).toBe(1);
  });

  it('gets one major revision for a company-owned job', async () => {
    const revision = majorRevision();
    jobRepo.findOne.mockResolvedValue(publishedJob);
    revisionRepo.findOne.mockResolvedValue(revision);

    const result = await service.getRevision(user, publishedJob.id, revision.id);

    expect(revisionRepo.findOne).toHaveBeenCalledWith({
      where: { id: revision.id, jobId: publishedJob.id, companyId: user.companyId },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: revision.id,
        jobId: publishedJob.id,
        title: revision.title,
      }),
    );
  });

  it('submits a major revision through moderation and notifies admins', async () => {
    const revision = majorRevision({ status: JobRevisionStatus.DRAFT });
    jobRepo.findOne.mockResolvedValue(publishedJob);
    revisionRepo.findOne.mockResolvedValue(revision);
    companySnapshotService.getPostingSnapshot.mockResolvedValue({
      companyId: publishedJob.companyId,
      companyName: publishedJob.companyName,
      companyLogoUrl: publishedJob.companyLogoUrl,
      companyStatus: CompanyStatusSnapshot.APPROVED,
      companyTrustLevel: CompanyTrustLevel.MEDIUM,
      snapshotAt: new Date('2026-07-16T00:00:00.000Z'),
    });
    moderationService.moderate.mockReturnValue({
      decision: JobModerationDecision.PENDING_REVIEW,
      riskScore: 12,
      riskLevel: JobModerationRiskLevel.LOW,
      reasons: [],
      matchedRules: [],
    });

    const result = await service.submitRevision(user, publishedJob.id, revision.id);

    expect(result.status).toBe(JobRevisionStatus.PENDING_REVIEW);
    expect(jobEventPublisher.publishJobRevisionReviewRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: publishedJob.id,
        companyId: publishedJob.companyId,
        revisionId: revision.id,
        status: JobRevisionStatus.PENDING_REVIEW,
        riskScore: 12,
        riskLevel: JobModerationRiskLevel.LOW,
      }),
    );
  });

  it('approves a major revision, applies it to the job, and emits revision events', async () => {
    const revision = majorRevision({
      status: JobRevisionStatus.NEEDS_REVIEW,
      riskScore: 10,
      riskLevel: JobModerationRiskLevel.LOW,
      moderationDecision: JobModerationDecision.PENDING_REVIEW,
      moderationReasons: ['No risky content detected'],
    });
    const jobToUpdate = { ...publishedJob, version: 1 };
    const moderationReview = {
      jobId: publishedJob.id,
      targetId: revision.id,
      reviewedByUserId: null,
      reviewedAt: null,
      adminDecision: null,
      adminReason: null,
    };
    revisionRepo.findOne.mockResolvedValue(revision);
    manager.findOneByOrFail.mockResolvedValue(jobToUpdate);
    moderationReviewRepo.findOne.mockResolvedValue(moderationReview);

    const result = await service.reviewRevision(admin, revision.id, {
      decision: JobReviewDecision.APPROVE,
      reason: 'Revision is valid',
    });

    expect(result.status).toBe(JobRevisionStatus.APPROVED);
    expect(manager.save).toHaveBeenCalledWith(
      JobRevision,
      expect.objectContaining({
        id: revision.id,
        status: JobRevisionStatus.APPROVED,
        reviewedByUserId: admin.id,
        reviewReason: 'Revision is valid',
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      Job,
      expect.objectContaining({
        id: publishedJob.id,
        title: 'Principal Backend Developer',
        skills: ['NestJS', 'PostgreSQL', 'Kafka'],
        version: 2,
      }),
    );
    expect(jobEventPublisher.publishRevisionApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: publishedJob.id,
        companyId: publishedJob.companyId,
        revisionId: revision.id,
      }),
    );
    expect(jobEventPublisher.publishJobRevisionReviewResultChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: publishedJob.id,
        companyId: publishedJob.companyId,
        revisionId: revision.id,
        status: JobRevisionStatus.APPROVED,
        decision: JobReviewDecision.APPROVE,
      }),
    );
    expect(jobEventPublisher.publishReviewTrustSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: JobModerationTargetType.REVISION,
        targetId: revision.id,
        decision: JobReviewDecision.APPROVE,
        riskLevel: JobModerationRiskLevel.LOW,
      }),
    );
  });

  describe('Recruiter Job Enhancements (Drafts, Partial Updates, Revisions)', () => {
    it('allows creating a draft with only a title', async () => {
      const dto = { title: 'Draft Job' } as any;
      revisionRepo.count.mockResolvedValue(0);
      companySnapshotService.getPostingSnapshot.mockResolvedValue({
        companyId: user.companyId,
        companyName: 'NexHire',
        companyLogoUrl: null,
        companyLogoDocumentId: null,
        companyStatus: CompanyStatusSnapshot.APPROVED,
        companyTrustLevel: CompanyTrustLevel.MEDIUM,
        snapshotAt: new Date(),
      });

      const result = await service.createDraft(user, dto);

      expect(result.title).toBe('Draft Job');
      expect(result.description).toBeNull();
      expect(result.status).toBe(JobStatus.DRAFT);
    });

    it('rejects draft submission with 400 and fields list when incomplete', async () => {
      const incompleteDraft: Job = {
        ...publishedJob,
        status: JobStatus.DRAFT,
        description: null,
        requirements: null,
        skills: [],
      };
      jobRepo.findOne.mockResolvedValue(incompleteDraft);

      await expect(service.submitMine(user, publishedJob.id)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: ERROR_CODES.JOB.DRAFT_INCOMPLETE,
          fields: expect.arrayContaining(['description', 'requirements', 'skills']),
        }),
      });
    });

    it('supports partial updates via PATCH', async () => {
      const job = { ...publishedJob, status: JobStatus.DRAFT, description: 'Old Description' };
      jobRepo.findOne.mockResolvedValue(job);

      const result = await service.updateMine(user, publishedJob.id, { title: 'New Title' });

      expect(jobRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Title',
          description: 'Old Description',
        }),
      );
    });

    it('clones all fields from the published job when creating a revision draft', async () => {
      const published = { ...publishedJob, status: JobStatus.PUBLISHED, applicationCount: 5 };
      jobRepo.findOne.mockResolvedValue(published);
      revisionRepo.count.mockResolvedValue(0);

      await service.createRevision(user, published.id, { changeSummary: 'Minor tweaks' } as any);

      expect(revisionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: published.title,
          description: published.description,
          requirements: published.requirements,
          skills: published.skills,
          changeSummary: 'Minor tweaks',
          status: JobRevisionStatus.DRAFT,
        }),
      );
    });
  });
});
