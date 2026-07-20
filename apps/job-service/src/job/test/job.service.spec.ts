import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
import { DataSource, Repository } from 'typeorm';
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
import { JobEventPublisher } from '../events/job-event.publisher';
import { JobService } from '../job.service';
import { JobModerationService } from '../moderation/job-moderation.service';
import { JobSearchTextService } from '../search/job-search-text.service';
import { JOB_SEARCH_PROVIDER } from '../search/job-search.types';

describe('JobService', () => {
  let service: JobService;
  let jobRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let revisionRepo: {
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
    publishJobUnpublished: jest.Mock;
    publishJobClosed: jest.Mock;
    publishReviewTrustSignal: jest.Mock;
  };
  let processedEventRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
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

  const jobInput = (overrides: Partial<Job> = {}) => ({
    title: overrides.title ?? publishedJob.title,
    description: overrides.description ?? publishedJob.description,
    requirements: overrides.requirements ?? publishedJob.requirements,
    skills: overrides.skills ?? publishedJob.skills,
    benefits: overrides.benefits ?? publishedJob.benefits ?? undefined,
    categoryId: overrides.categoryId ?? publishedJob.categoryId ?? undefined,
    employmentType: overrides.employmentType ?? publishedJob.employmentType,
    workingType: overrides.workingType ?? publishedJob.workingType,
    experienceLevel: overrides.experienceLevel ?? publishedJob.experienceLevel,
    location: overrides.location ?? publishedJob.location,
    salaryMin: overrides.salaryMin ?? publishedJob.salaryMin ?? undefined,
    salaryMax: overrides.salaryMax ?? publishedJob.salaryMax ?? undefined,
    salaryCurrency: overrides.salaryCurrency ?? publishedJob.salaryCurrency,
    isSalaryVisible: overrides.isSalaryVisible ?? publishedJob.isSalaryVisible,
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
    };
    revisionRepo = {
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
      publishJobUnpublished: jest.fn().mockResolvedValue(undefined),
      publishJobClosed: jest.fn().mockResolvedValue(undefined),
      publishReviewTrustSignal: jest.fn().mockResolvedValue(undefined),
    };
    processedEventRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(),
    };
    manager = {
      getRepository: jest.fn((entity) =>
        entity === JobModerationReview ? moderationReviewRepo : processedEventRepo,
      ),
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
        { provide: getRepositoryToken(Job), useValue: jobRepo },
        { provide: getRepositoryToken(JobRevision), useValue: revisionRepo },
        { provide: getRepositoryToken(JobModerationReview), useValue: moderationReviewRepo },
        { provide: getRepositoryToken(JobProcessedApplicationEvent), useValue: processedEventRepo },
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
    const query = { page: 1, limit: 10, skip: 0 };
    jobSearchProvider.searchPublicCompanyJobs.mockResolvedValue(expected);

    await expect(service.listPublicByCompany(publishedJob.companyId, query as any)).resolves.toBe(
      expected,
    );
    expect(jobSearchProvider.searchPublicCompanyJobs).toHaveBeenCalledWith(
      publishedJob.companyId,
      query,
    );
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
          companyLogoUrl: publishedJob.companyLogoUrl,
          companyLogoDocumentId: publishedJob.companyLogoDocumentId,
          activeJobCount: '4',
          latestPublishedAt: publishedJob.publishedAt,
        },
      ]),
    };
    jobRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listFeaturedCompanies('8');

    expect(qb.addSelect).toHaveBeenCalledWith(
      'MAX(CAST(job.companyLogoDocumentId AS text))',
      'companyLogoDocumentId',
    );
    expect(qb.where).toHaveBeenCalledWith('job.status = :status', {
      status: JobStatus.PUBLISHED,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('job.deletedAt IS NULL');
    expect(qb.limit).toHaveBeenCalledWith(8);
    expect(result).toEqual([
      {
        companyId: publishedJob.companyId,
        companyName: publishedJob.companyName,
        companyLogoUrl: publishedJob.companyLogoUrl,
        companyLogoDocumentId: publishedJob.companyLogoDocumentId,
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
    jobRepo.count.mockResolvedValue(42);
    jobRepo.createQueryBuilder
      .mockReturnValueOnce(companyCountQb)
      .mockReturnValueOnce(categoryCountQb);

    await expect(service.getHomeStats()).resolves.toEqual({
      publishedJobCount: 42,
      activeCompanyCount: 6,
      categoryCount: 4,
    });
    expect(jobRepo.count).toHaveBeenCalledWith({
      where: { status: JobStatus.PUBLISHED, deletedAt: expect.any(Object) },
    });
    expect(companyCountQb.andWhere).toHaveBeenCalledWith('job.deletedAt IS NULL');
    expect(categoryCountQb.andWhere).toHaveBeenCalledWith('job.deletedAt IS NULL');
    expect(categoryCountQb.andWhere).toHaveBeenCalledWith('job.categoryId IS NOT NULL');
  });

  it('lists major revisions for a company-owned job', async () => {
    const revision = majorRevision({ status: JobRevisionStatus.PENDING_REVIEW });
    jobRepo.findOne.mockResolvedValue(publishedJob);
    revisionRepo.findAndCount.mockResolvedValue([[revision], 1]);
    const query = { page: 1, limit: 10, skip: 0, status: JobRevisionStatus.PENDING_REVIEW };

    const result = await service.listRevisions(user, publishedJob.id, query as any);

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
    expect(jobEventPublisher.publishReviewTrustSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: JobModerationTargetType.REVISION,
        targetId: revision.id,
        decision: JobReviewDecision.APPROVE,
        riskLevel: JobModerationRiskLevel.LOW,
      }),
    );
  });
});
