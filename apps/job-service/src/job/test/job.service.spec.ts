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
import { CompanySnapshotService } from '../company-snapshot.service';
import { CompanyStatusSnapshot, CompanyTrustLevel } from '../entities/job.enum';
import { JobModerationReview } from '../entities/job-moderation-review.entity';
import { JobRevision } from '../entities/job-revision.entity';
import { Job } from '../entities/job.entity';
import { JobModerationService } from '../job-moderation.service';
import { JobService } from '../job.service';

describe('JobService', () => {
  let service: JobService;
  let jobRepo: jest.Mocked<Pick<Repository<Job>, 'findOne' | 'increment'>>;

  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    role: UserRole.RECRUITER,
    companyId: '22222222-2222-2222-2222-222222222222',
  };

  const publishedJob: Job = {
    id: '33333333-3333-3333-3333-333333333333',
    companyId: user.companyId,
    companyName: 'NexHire',
    companyStatus: CompanyStatusSnapshot.APPROVED,
    companyTrustLevel: CompanyTrustLevel.MEDIUM,
    companySnapshotAt: new Date(),
    createdByUserId: user.id,
    title: 'Backend Developer',
    description:
      'Develop and maintain REST APIs for a recruitment platform using NestJS and PostgreSQL.',
    requirements: 'At least one year of experience with Node.js and TypeScript.',
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jobRepo = {
      findOne: jest.fn(),
      increment: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        JobService,
        { provide: DataSource, useValue: {} },
        { provide: CompanySnapshotService, useValue: {} },
        { provide: JobModerationService, useValue: {} },
        { provide: EventPublisher, useValue: { publish: jest.fn() } },
        { provide: getRepositoryToken(Job), useValue: jobRepo },
        { provide: getRepositoryToken(JobRevision), useValue: {} },
        { provide: getRepositoryToken(JobModerationReview), useValue: {} },
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

    expect(jobRepo.increment).toHaveBeenCalledWith({ id: publishedJob.id }, 'applicationCount', 1);
  });
});
