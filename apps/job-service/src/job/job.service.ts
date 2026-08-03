import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REDIS_CLIENT } from '@nexhire/infra';
import {
  AuthUser,
  ERROR_CODES,
  JobModerationDecision,
  JobRevisionStatus,
  JobReviewDecision,
  JobStatus,
  UserRole,
} from '@nexhire/shared';
import { Redis } from 'ioredis';
import { Brackets, DataSource, In, IsNull, Repository } from 'typeorm';
import { CompanySnapshotService } from './company/company-snapshot.service';
import {
  CreateJobDto,
  CreateJobRevisionDto,
  UpdateJobDto,
  UpdateJobRevisionDto,
} from './dto/job-input.dto';
import {
  AdminJobQueryDto,
  AdminJobRevisionReviewQueueQueryDto,
  AdminJobReviewQueueQueryDto,
  AdminJobSort,
  PublicJobQueryDto,
  RecruiterJobRevisionQueryDto,
  RecruiterJobQueryDto,
} from './dto/job-query.dto';
import { JobReasonDto, ReviewJobDto } from './dto/job-review.dto';
import { AdminJobOverviewDto } from './dto/admin-job-overview.dto';
import {
  AdminJobGrowthBucket,
  AdminJobGrowthDto,
  AdminJobGrowthPointDto,
  AdminJobGrowthQueryDto,
} from './dto/admin-job-growth.dto';
import {
  JobResponseDto,
  JobApplicationSnapshotDto,
  JobMatchingSnapshotDto,
  JobSavedSnapshotDto,
  JobRevisionResponseDto,
  PublicFeaturedCompanyDto,
  PublicHomeStatsDto,
  PublicJobDetailDto,
  PublicJobListItemDto,
  RecruiterJobStatusCountsDto,
} from './dto/job-response.dto';
import { JobModerationReview } from './entities/job-moderation-review.entity';
import { JobProcessedApplicationEvent } from './entities/job-processed-application-event.entity';
import { JobRevision } from './entities/job-revision.entity';
import { Job } from './entities/job.entity';
import { CompanyPostingSnapshot } from './entities/company-posting-snapshot.entity';
import {
  CompanyStatusSnapshot,
  CompanyTrustLevel,
  JobModerationTargetType,
} from './entities/job.enum';
import { JobEventPublisher } from './events/job-event.publisher';
import { JobModerationResult, JobModerationService } from './moderation/job-moderation.service';
import { JobSearchTextService } from './search/job-search-text.service';
import { JOB_SEARCH_PROVIDER, JobSearchProvider, Paginated } from './search/job-search.types';
import { DocumentClientService } from '../document-client/document-client.service';

const ACTIVE_REVIEW_STATUSES = [
  JobStatus.PENDING_REVIEW,
  JobStatus.NEEDS_REVIEW,
  JobStatus.SHOULD_REJECT,
];

const ACTIVE_REVISION_STATUSES = [
  JobRevisionStatus.DRAFT,
  JobRevisionStatus.PENDING_REVIEW,
  JobRevisionStatus.NEEDS_REVIEW,
  JobRevisionStatus.SHOULD_REJECT,
];

const COMPANY_STATUS_NOT_APPROVED_MESSAGE = 'Company is no longer approved for job posting';
const PUBLIC_JOB_CACHE_TTL_SECONDS = 30;
const PUBLIC_JOB_CACHE_VERSION_KEY = 'job:public-cache:version';

interface AdminJobGrowthRange {
  from: Date;
  to: Date;
  toExclusive: Date;
  bucket: AdminJobGrowthBucket;
}

export interface CompanyPostingSnapshotChangedPayload {
  companyId: string;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  companyLogoDocumentId?: string | null;
  companyStatus: CompanyStatusSnapshot;
  companyTrustLevel?: CompanyTrustLevel;
  changedAt?: string;
}

export interface ApplicationSubmittedPayload {
  applicationId: string;
  jobId: string;
  candidateId: string;
  submittedAt?: string;
}

const MAJOR_FIELDS: Array<keyof UpdateJobDto> = [
  'title',
  'description',
  'requirements',
  'skills',
  'benefits',
  'categoryId',
  'employmentType',
  'workingType',
  'experienceLevel',
  'location',
  'salaryMin',
  'salaryMax',
  'salaryCurrency',
];

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly companySnapshotService: CompanySnapshotService,
    private readonly moderationService: JobModerationService,
    @Inject(JOB_SEARCH_PROVIDER)
    private readonly jobSearchProvider: JobSearchProvider,
    private readonly searchTextService: JobSearchTextService,
    private readonly jobEventPublisher: JobEventPublisher,
    private readonly documentClientService: DocumentClientService,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    @InjectRepository(JobRevision)
    private readonly revisionRepo: Repository<JobRevision>,
    @InjectRepository(JobModerationReview)
    private readonly moderationReviewRepo: Repository<JobModerationReview>,
    @InjectRepository(JobProcessedApplicationEvent)
    private readonly processedApplicationEventRepo: Repository<JobProcessedApplicationEvent>,
  ) {}

  async listPublic(query: PublicJobQueryDto): Promise<Paginated<PublicJobListItemDto>> {
    return this.getOrSetPublicCache(['public-jobs', this.cacheableQuery(query)], () =>
      this.jobSearchProvider.searchPublicJobs(query),
    );
  }

  async listPublicByCompany(
    companyId: string,
    query: PublicJobQueryDto,
  ): Promise<Paginated<PublicJobListItemDto>> {
    return this.getOrSetPublicCache(
      ['public-company-jobs', companyId, this.cacheableQuery(query)],
      () => this.jobSearchProvider.searchPublicCompanyJobs(companyId, query),
    );
  }

  async getPublic(id: string): Promise<PublicJobDetailDto> {
    const job = await this.jobRepo.findOne({ where: { id, status: JobStatus.PUBLISHED } });
    if (!job) {
      throw new NotFoundException({
        code: ERROR_CODES.JOB.JOB_NOT_PUBLIC,
        message: 'Published job was not found',
      });
    }
    return this.mapPublicJobDetail(job);
  }

  async listFeaturedCompanies(limitValue?: string): Promise<PublicFeaturedCompanyDto[]> {
    const limit = this.parsePublicLimit(limitValue, 6, 20);
    return this.getOrSetPublicCache(['featured-companies', limit], () =>
      this.listFeaturedCompaniesUncached(limit),
    );
  }

  private async listFeaturedCompaniesUncached(limit: number): Promise<PublicFeaturedCompanyDto[]> {
    const rows = await this.jobRepo
      .createQueryBuilder('job')
      .select('job.companyId', 'companyId')
      .addSelect('MAX(job.companyName)', 'companyName')
      .addSelect('MAX(job.companyLogoUrl)', 'companyLogoUrl')
      .addSelect('MAX(CAST(job.companyLogoDocumentId AS text))', 'companyLogoDocumentId')
      .addSelect('COUNT(job.id)', 'activeJobCount')
      .addSelect('MAX(job.publishedAt)', 'latestPublishedAt')
      .where('job.status = :status', { status: JobStatus.PUBLISHED })
      .andWhere('"job"."deleted_at" IS NULL')
      .groupBy('job.companyId')
      .orderBy('COUNT(job.id)', 'DESC')
      .addOrderBy('MAX(job.publishedAt)', 'DESC')
      .limit(limit)
      .getRawMany<{
        companyId: string;
        companyName: string | null;
        companyLogoUrl: string | null;
        companyLogoDocumentId: string | null;
        activeJobCount: string;
        latestPublishedAt: Date | null;
      }>();

    return Promise.all(
      rows.map(async (row) => ({
        companyId: row.companyId,
        companyName: row.companyName,
        companyLogoUrl: await this.resolveDocumentUrl(
          row.companyLogoDocumentId,
          row.companyLogoUrl,
        ),
        companyLogoDocumentId: row.companyLogoDocumentId,
        activeJobCount: Number(row.activeJobCount),
        latestPublishedAt: row.latestPublishedAt,
      })),
    );
  }

  async getHomeStats(): Promise<PublicHomeStatsDto> {
    return this.getOrSetPublicCache(['home-stats'], () => this.getHomeStatsUncached());
  }

  private async getHomeStatsUncached(): Promise<PublicHomeStatsDto> {
    const [publishedJobCount, activeCompanyCount, categoryCount] = await Promise.all([
      this.jobRepo.count({ where: { status: JobStatus.PUBLISHED, deletedAt: IsNull() } }),
      this.jobRepo
        .createQueryBuilder('job')
        .select('COUNT(DISTINCT job.companyId)', 'count')
        .where('job.status = :status', { status: JobStatus.PUBLISHED })
        .andWhere('"job"."deleted_at" IS NULL')
        .getRawOne<{ count: string }>(),
      this.jobRepo
        .createQueryBuilder('job')
        .select('COUNT(DISTINCT job.categoryId)', 'count')
        .where('job.status = :status', { status: JobStatus.PUBLISHED })
        .andWhere('"job"."deleted_at" IS NULL')
        .andWhere('job.categoryId IS NOT NULL')
        .getRawOne<{ count: string }>(),
    ]);

    return {
      publishedJobCount,
      activeCompanyCount: Number(activeCompanyCount?.count ?? 0),
      categoryCount: Number(categoryCount?.count ?? 0),
    };
  }

  async getApplicationSnapshot(id: string): Promise<JobApplicationSnapshotDto> {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) {
      throw this.jobNotFound();
    }
    const isDeadlineOpen = !job.deadline || job.deadline.getTime() > Date.now();
    return {
      id: job.id,
      companyId: job.companyId,
      companyName: job.companyName,
      companyLogoUrl: job.companyLogoUrl,
      companyLogoDocumentId: job.companyLogoDocumentId,
      title: job.title,
      status: job.status,
      deadline: job.deadline,
      isApplyable: job.status === JobStatus.PUBLISHED && isDeadlineOpen,
    };
  }

  async getMatchingSnapshot(id: string): Promise<JobMatchingSnapshotDto> {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) {
      throw this.jobNotFound();
    }
    return {
      id: job.id,
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      skills: job.skills,
      benefits: job.benefits,
      workingType: job.workingType,
      experienceLevel: job.experienceLevel,
      location: job.location,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
    };
  }

  async getSavedSnapshot(id: string): Promise<JobSavedSnapshotDto> {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) {
      throw this.jobNotFound();
    }
    return this.mapSavedSnapshot(job);
  }

  async expirePublishedJobs(referenceDate = new Date()): Promise<number> {
    const result = await this.jobRepo
      .createQueryBuilder()
      .update(Job)
      .set({
        status: JobStatus.EXPIRED,
        unpublishedAt: referenceDate,
        unpublishReason: 'Job deadline expired',
      })
      .where('status = :status', { status: JobStatus.PUBLISHED })
      .andWhere('deadline IS NOT NULL')
      .andWhere('deadline <= :referenceDate', { referenceDate })
      .andWhere('deleted_at IS NULL')
      .execute();
    const affected = result.affected ?? 0;
    if (affected > 0) {
      await this.invalidatePublicCache();
      this.logger.log(`Expired published jobs count=${affected}`);
    }
    return affected;
  }

  async createDraft(user: AuthUser, dto: CreateJobDto): Promise<JobResponseDto> {
    this.assertRecruiter(user);
    this.assertJobInput(dto);
    const company = await this.companySnapshotService.getPostingSnapshot(user);

    const job = await this.jobRepo.save(
      this.jobRepo.create({
        ...this.jobInput(dto),
        companyId: company.companyId,
        companyName: company.companyName,
        companyLogoUrl: company.companyLogoUrl,
        companyLogoDocumentId: company.companyLogoDocumentId,
        companyStatus: company.companyStatus,
        companyTrustLevel: company.companyTrustLevel,
        companySnapshotAt: company.snapshotAt,
        createdByUserId: user.id,
        status: JobStatus.DRAFT,
        version: 1,
        applicationCount: 0,
        moderationReasons: [],
        moderationMatchedRules: [],
        ...this.searchTextService.buildSearchFields(dto, company.companyName),
      }),
    );
    this.logger.log(
      `Job draft created jobId=${job.id} companyId=${job.companyId} userId=${user.id}`,
    );

    return this.mapJob(job);
  }

  async listMine(user: AuthUser, query: RecruiterJobQueryDto): Promise<Paginated<JobResponseDto>> {
    this.assertRecruiter(user);
    return this.jobSearchProvider.searchCompanyJobs(user.companyId!, query);
  }

  async getCompanyStatusCounts(user: AuthUser): Promise<RecruiterJobStatusCountsDto> {
    this.assertRecruiter(user);
    const rows = await this.jobRepo
      .createQueryBuilder('job')
      .select('job.status', 'status')
      .addSelect('COUNT(job.id)', 'count')
      .where('job.companyId = :companyId', { companyId: user.companyId })
      .andWhere('"job"."deleted_at" IS NULL')
      .groupBy('job.status')
      .getRawMany<{ status: JobStatus; count: string }>();

    const counts = this.emptyJobStatusCounts();
    for (const row of rows) {
      counts[row.status] = Number(row.count);
    }
    return counts;
  }

  async getMine(user: AuthUser, id: string): Promise<JobResponseDto> {
    const job = await this.findCompanyJob(user, id);
    return this.mapJob(job);
  }

  async updateMine(user: AuthUser, id: string, dto: UpdateJobDto): Promise<JobResponseDto> {
    this.assertJobInput(dto);
    const job = await this.findCompanyJob(user, id);

    if (job.status === JobStatus.PUBLISHED && this.hasMajorChange(job, dto)) {
      if (job.applicationCount > 0) {
        this.logger.warn(
          `Major update blocked: published job has applications jobId=${job.id} applicationCount=${job.applicationCount}`,
        );
        throw new ConflictException({
          code: ERROR_CODES.JOB.MAJOR_UPDATE_REQUIRES_REVISION,
          message: 'Major updates to a published job with applications must use a revision',
        });
      }
      this.logger.warn(`Major update blocked: published job requires review jobId=${job.id}`);
      throw new ConflictException({
        code: ERROR_CODES.JOB.MAJOR_UPDATE_REQUIRES_REVIEW,
        message: 'Major updates to a published job must be reviewed before going public',
      });
    }

    if (![JobStatus.DRAFT, JobStatus.PUBLISHED].includes(job.status)) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.JOB_NOT_EDITABLE,
        message: 'Only draft or published jobs can be edited by recruiters',
      });
    }

    Object.assign(
      job,
      this.jobInput(dto),
      this.searchTextService.buildSearchFields(dto, job.companyName),
    );
    const updated = await this.jobRepo.save(job);
    await this.invalidatePublicCache();
    this.logger.log(`Job updated jobId=${updated.id} status=${updated.status} userId=${user.id}`);
    return this.mapJob(updated);
  }

  async submitMine(user: AuthUser, id: string): Promise<JobResponseDto> {
    const job = await this.findCompanyJob(user, id);
    if (job.status !== JobStatus.DRAFT) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.JOB_NOT_EDITABLE,
        message: 'Only draft jobs can be submitted for review',
      });
    }

    const company = await this.companySnapshotService.getPostingSnapshot(user);
    const moderation = this.moderationService.moderate(job, company);
    const updated = await this.dataSource.transaction(async (manager) => {
      Object.assign(job, {
        companyName: company.companyName,
        companyLogoUrl: company.companyLogoUrl,
        companyLogoDocumentId: company.companyLogoDocumentId,
        companyStatus: company.companyStatus,
        companyTrustLevel: company.companyTrustLevel,
        companySnapshotAt: company.snapshotAt,
        ...this.searchTextService.buildSearchFields(job, company.companyName),
        status: this.statusForDecision(moderation.decision),
        riskScore: moderation.riskScore,
        riskLevel: moderation.riskLevel,
        moderationDecision: moderation.decision,
        moderationReasons: moderation.reasons,
        moderationMatchedRules: moderation.matchedRules,
        reviewedByUserId: null,
        reviewedAt: null,
        reviewReason: null,
      });
      const saved = await manager.save(Job, job);
      await this.recordModeration(manager.getRepository(JobModerationReview), {
        jobId: saved.id,
        targetType: JobModerationTargetType.JOB,
        targetId: saved.id,
        moderation,
      });
      return saved;
    });
    this.logger.log(
      `Job submitted for review jobId=${updated.id} status=${updated.status} riskLevel=${updated.riskLevel} riskScore=${updated.riskScore}`,
    );
    await this.publishJobReviewRequired(updated);

    return this.mapJob(updated);
  }

  async createRevision(
    user: AuthUser,
    jobId: string,
    dto: CreateJobRevisionDto,
  ): Promise<JobRevisionResponseDto> {
    this.assertJobInput(dto);
    const job = await this.findCompanyJob(user, jobId);
    if (job.status !== JobStatus.PUBLISHED || job.applicationCount <= 0) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.JOB_NOT_EDITABLE,
        message: 'Revisions are only required for published jobs with applications',
      });
    }
    await this.assertNoActiveRevision(job.id);

    const revision = await this.revisionRepo.save(
      this.revisionRepo.create({
        ...this.revisionInput(dto),
        jobId: job.id,
        companyId: job.companyId,
        createdByUserId: user.id,
        status: JobRevisionStatus.DRAFT,
        moderationReasons: [],
        moderationMatchedRules: [],
        deletedAt: null,
      }),
    );
    this.logger.log(
      `Job revision draft created revisionId=${revision.id} jobId=${job.id} userId=${user.id}`,
    );
    return this.mapRevision(revision);
  }

  async listRevisions(
    user: AuthUser,
    jobId: string,
    query: RecruiterJobRevisionQueryDto,
  ): Promise<Paginated<JobRevisionResponseDto>> {
    await this.findCompanyJob(user, jobId);
    const where = {
      jobId,
      companyId: user.companyId!,
      ...(query.status ? { status: query.status } : {}),
    };
    const [revisions, total] = await this.revisionRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return this.paginate(
      revisions.map((revision) => this.mapRevision(revision)),
      query.page,
      query.limit,
      total,
    );
  }

  async getRevision(
    user: AuthUser,
    jobId: string,
    revisionId: string,
  ): Promise<JobRevisionResponseDto> {
    await this.findCompanyJob(user, jobId);
    return this.mapRevision(await this.findCompanyRevision(user, jobId, revisionId));
  }

  async updateRevision(
    user: AuthUser,
    jobId: string,
    revisionId: string,
    dto: UpdateJobRevisionDto,
  ): Promise<JobRevisionResponseDto> {
    this.assertJobInput(dto);
    await this.findCompanyJob(user, jobId);
    const revision = await this.findCompanyRevision(user, jobId, revisionId);
    if (revision.status !== JobRevisionStatus.DRAFT) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.REVISION_NOT_EDITABLE,
        message: 'Only draft revisions can be edited',
      });
    }
    Object.assign(revision, this.revisionInput(dto));
    const saved = await this.revisionRepo.save(revision);
    this.logger.log(`Job revision updated revisionId=${saved.id} jobId=${jobId} userId=${user.id}`);
    return this.mapRevision(saved);
  }

  async submitRevision(
    user: AuthUser,
    jobId: string,
    revisionId: string,
  ): Promise<JobRevisionResponseDto> {
    const job = await this.findCompanyJob(user, jobId);
    const revision = await this.findCompanyRevision(user, jobId, revisionId);
    if (revision.status !== JobRevisionStatus.DRAFT) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.REVISION_NOT_EDITABLE,
        message: 'Only draft revisions can be submitted for review',
      });
    }

    const company = await this.companySnapshotService.getPostingSnapshot(user);
    const moderation = this.moderationService.moderate(revision, company);
    const updated = await this.dataSource.transaction(async (manager) => {
      Object.assign(revision, {
        status: this.revisionStatusForDecision(moderation.decision),
        riskScore: moderation.riskScore,
        riskLevel: moderation.riskLevel,
        moderationDecision: moderation.decision,
        moderationReasons: moderation.reasons,
        moderationMatchedRules: moderation.matchedRules,
      });
      const saved = await manager.save(JobRevision, revision);
      await this.recordModeration(manager.getRepository(JobModerationReview), {
        jobId: job.id,
        targetType: JobModerationTargetType.REVISION,
        targetId: saved.id,
        moderation,
      });
      return saved;
    });
    this.logger.log(
      `Job revision submitted revisionId=${updated.id} jobId=${job.id} status=${updated.status} riskLevel=${updated.riskLevel} riskScore=${updated.riskScore}`,
    );
    await this.publishJobRevisionReviewRequired(job, updated);

    return this.mapRevision(updated);
  }

  async listReviewQueue(query: AdminJobReviewQueueQueryDto): Promise<Paginated<JobResponseDto>> {
    const qb = this.jobRepo
      .createQueryBuilder('job')
      .where('job.status IN (:...statuses)', {
        statuses: query.status ? [query.status] : ACTIVE_REVIEW_STATUSES,
      })
      .orderBy('job.createdAt', 'ASC')
      .skip(query.skip)
      .take(query.limit);

    if (query.search) {
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('job.title ILIKE :search', { search: `%${query.search}%` })
            .orWhere('job.companyName ILIKE :search', { search: `%${query.search}%` });
        }),
      );
    }

    const [jobs, total] = await qb.getManyAndCount();
    return this.paginate(
      jobs.map((job) => this.mapJob(job)),
      query.page,
      query.limit,
      total,
    );
  }

  async listAdminJobs(query: AdminJobQueryDto): Promise<Paginated<JobResponseDto>> {
    const qb = this.jobRepo
      .createQueryBuilder('job')
      .where('"job"."deleted_at" IS NULL')
      .skip(query.skip)
      .take(query.limit);

    if (query.status) {
      qb.andWhere('job.status = :status', { status: query.status });
    }
    if (query.riskLevel) {
      qb.andWhere('job.riskLevel = :riskLevel', { riskLevel: query.riskLevel });
    }
    if (query.companyId) {
      qb.andWhere('job.companyId = :companyId', { companyId: query.companyId });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('job.title ILIKE :search', { search: `%${search}%` })
            .orWhere('job.companyName ILIKE :search', { search: `%${search}%` })
            .orWhere('job.location ILIKE :search', { search: `%${search}%` })
            .orWhere('job.searchSkills ILIKE :search', { search: `%${search}%` });
        }),
      );
    }

    if (query.sort === AdminJobSort.OLDEST) {
      qb.orderBy('job.createdAt', 'ASC');
    } else if (query.sort === AdminJobSort.RISK_DESC) {
      qb.orderBy('job.riskScore', 'DESC', 'NULLS LAST').addOrderBy('job.createdAt', 'DESC');
    } else if (query.sort === AdminJobSort.APPLICATIONS_DESC) {
      qb.orderBy('job.applicationCount', 'DESC').addOrderBy('job.createdAt', 'DESC');
    } else {
      qb.orderBy('job.createdAt', 'DESC');
    }

    const [jobs, total] = await qb.getManyAndCount();
    return this.paginate(
      jobs.map((job) => this.mapJob(job)),
      query.page,
      query.limit,
      total,
    );
  }

  async getAdminJob(id: string): Promise<JobResponseDto> {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) {
      throw this.jobNotFound();
    }
    return this.mapJob(job);
  }

  async getAdminRevision(revisionId: string): Promise<JobRevisionResponseDto> {
    const revision = await this.revisionRepo.findOne({ where: { id: revisionId } });
    if (!revision) {
      throw new NotFoundException({
        code: ERROR_CODES.JOB.REVISION_NOT_FOUND,
        message: 'Job revision was not found',
      });
    }
    return this.mapRevision(revision);
  }

  async getAdminOverview(): Promise<AdminJobOverviewDto> {
    const [totalJobs, jobStatusRows, totalRevisions, revisionStatusRows] = await Promise.all([
      this.jobRepo.count({ where: { deletedAt: IsNull() } }),
      this.jobRepo
        .createQueryBuilder('job')
        .select('job.status', 'status')
        .addSelect('COUNT(job.id)', 'count')
        .where('"job"."deleted_at" IS NULL')
        .groupBy('job.status')
        .getRawMany<{ status: JobStatus; count: string }>(),
      this.revisionRepo.count({ where: { deletedAt: IsNull() } }),
      this.revisionRepo
        .createQueryBuilder('revision')
        .select('revision.status', 'status')
        .addSelect('COUNT(revision.id)', 'count')
        .where('"revision"."deleted_at" IS NULL')
        .groupBy('revision.status')
        .getRawMany<{ status: JobRevisionStatus; count: string }>(),
    ]);
    const jobsByStatus = this.jobStatusCounts(jobStatusRows);
    const revisionsByStatus = this.revisionStatusCounts(revisionStatusRows);
    return {
      totalJobs,
      jobsByStatus,
      jobsWaitingReview: ACTIVE_REVIEW_STATUSES.reduce(
        (sum, status) => sum + jobsByStatus[status],
        0,
      ),
      publishedJobs: jobsByStatus[JobStatus.PUBLISHED],
      unpublishedJobs: jobsByStatus[JobStatus.UNPUBLISHED],
      closedJobs: jobsByStatus[JobStatus.CLOSED],
      totalRevisions,
      revisionsByStatus,
      revisionsWaitingReview: [
        JobRevisionStatus.PENDING_REVIEW,
        JobRevisionStatus.NEEDS_REVIEW,
        JobRevisionStatus.SHOULD_REJECT,
      ].reduce((sum, status) => sum + revisionsByStatus[status], 0),
    };
  }

  async getAdminGrowth(query: AdminJobGrowthQueryDto): Promise<AdminJobGrowthDto> {
    const range = this.normalizeJobGrowthRange(query);
    const points = this.createJobGrowthPoints(range);
    const pointByBucket = new Map(points.map((point) => [point.bucket, point]));

    const [
      createdRows,
      publishedRows,
      unpublishedRows,
      closedRows,
      reviewedRows,
      rejectedRows,
      applicationRows,
    ] = await Promise.all([
      this.countJobRows('"job"."created_at"', range),
      this.countJobRows('"job"."published_at"', range),
      this.countJobRows('"job"."unpublished_at"', range),
      this.countJobRows('"job"."closed_at"', range),
      this.countJobRows('"job"."reviewed_at"', range),
      this.countJobStatusRows(JobStatus.REJECTED, '"job"."reviewed_at"', range),
      this.countApplicationRows(range),
    ]);

    this.applyJobGrowthRows(pointByBucket, createdRows, 'createdJobs');
    this.applyJobGrowthRows(pointByBucket, publishedRows, 'publishedJobs');
    this.applyJobGrowthRows(pointByBucket, unpublishedRows, 'unpublishedJobs');
    this.applyJobGrowthRows(pointByBucket, closedRows, 'closedJobs');
    this.applyJobGrowthRows(pointByBucket, reviewedRows, 'reviewedJobs');
    this.applyJobGrowthRows(pointByBucket, rejectedRows, 'rejectedJobs');
    this.applyJobGrowthRows(pointByBucket, applicationRows, 'applicationsSubmitted');

    return {
      from: this.formatJobDateKey(range.from, range.bucket),
      to: this.formatJobDateKey(range.to, range.bucket),
      bucket: range.bucket,
      points,
    };
  }

  private async countJobRows(
    column: string,
    range: AdminJobGrowthRange,
  ): Promise<Array<{ bucket: string; count: string }>> {
    return this.jobRepo
      .createQueryBuilder('job')
      .select(this.jobBucketSelect(column, range), 'bucket')
      .addSelect('COUNT("job"."id")', 'count')
      .where('"job"."deleted_at" IS NULL')
      .andWhere(`${column} >= :from`, { from: range.from })
      .andWhere(`${column} < :to`, { to: range.toExclusive })
      .groupBy('bucket')
      .getRawMany<{ bucket: string; count: string }>();
  }

  private async countJobStatusRows(
    status: JobStatus,
    column: string,
    range: AdminJobGrowthRange,
  ): Promise<Array<{ bucket: string; count: string }>> {
    return this.jobRepo
      .createQueryBuilder('job')
      .select(this.jobBucketSelect(column, range), 'bucket')
      .addSelect('COUNT("job"."id")', 'count')
      .where('"job"."deleted_at" IS NULL')
      .andWhere('"job"."status" = :status', { status })
      .andWhere(`${column} >= :from`, { from: range.from })
      .andWhere(`${column} < :to`, { to: range.toExclusive })
      .groupBy('bucket')
      .getRawMany<{ bucket: string; count: string }>();
  }

  private async countApplicationRows(
    range: AdminJobGrowthRange,
  ): Promise<Array<{ bucket: string; count: string }>> {
    return this.processedApplicationEventRepo
      .createQueryBuilder('event')
      .select(this.jobBucketSelect('"event"."processed_at"', range), 'bucket')
      .addSelect('COUNT("event"."application_id")', 'count')
      .where('"event"."processed_at" >= :from', { from: range.from })
      .andWhere('"event"."processed_at" < :to', { to: range.toExclusive })
      .groupBy('bucket')
      .getRawMany<{ bucket: string; count: string }>();
  }

  private applyJobGrowthRows(
    pointByBucket: Map<string, AdminJobGrowthPointDto>,
    rows: Array<{ bucket: string; count: string }>,
    field: keyof Omit<AdminJobGrowthPointDto, 'bucket'>,
  ): void {
    for (const row of rows) {
      const point = pointByBucket.get(row.bucket);
      if (point) {
        point[field] = Number(row.count);
      }
    }
  }

  private createJobGrowthPoints(range: AdminJobGrowthRange): AdminJobGrowthPointDto[] {
    return this.createJobBucketKeys(range).map((bucket) => ({
      bucket,
      createdJobs: 0,
      publishedJobs: 0,
      unpublishedJobs: 0,
      closedJobs: 0,
      reviewedJobs: 0,
      rejectedJobs: 0,
      applicationsSubmitted: 0,
    }));
  }

  private normalizeJobGrowthRange(query: AdminJobGrowthQueryDto): AdminJobGrowthRange {
    const bucket = query.bucket ?? AdminJobGrowthBucket.DAY;
    const now = new Date();
    const defaultTo = this.startOfUtcDay(now);
    const defaultFrom = new Date(defaultTo);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

    const from = query.from ? this.parseJobDateBoundary(query.from) : defaultFrom;
    const to = query.to ? this.parseJobDateBoundary(query.to) : defaultTo;
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'from must be before or equal to to',
      });
    }

    return {
      from,
      to,
      toExclusive: this.addJobBucket(to, bucket),
      bucket,
    };
  }

  private parseJobDateBoundary(value: string): Date {
    const parsed = new Date(value);
    return this.startOfUtcDay(parsed);
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private addJobBucket(date: Date, bucket: AdminJobGrowthBucket): Date {
    const next = new Date(date);
    if (bucket === AdminJobGrowthBucket.MONTH) {
      next.setUTCMonth(next.getUTCMonth() + 1);
    } else {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  private createJobBucketKeys(range: AdminJobGrowthRange): string[] {
    const keys: string[] = [];
    const cursor =
      range.bucket === AdminJobGrowthBucket.MONTH
        ? new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1))
        : new Date(range.from);
    const end =
      range.bucket === AdminJobGrowthBucket.MONTH
        ? new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), 1))
        : range.to;

    while (cursor.getTime() <= end.getTime()) {
      keys.push(this.formatJobDateKey(cursor, range.bucket));
      if (range.bucket === AdminJobGrowthBucket.MONTH) {
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      } else {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    return keys;
  }

  private jobBucketSelect(column: string, range: AdminJobGrowthRange): string {
    const unit = range.bucket === AdminJobGrowthBucket.MONTH ? 'month' : 'day';
    const format = range.bucket === AdminJobGrowthBucket.MONTH ? 'YYYY-MM' : 'YYYY-MM-DD';
    return `to_char(date_trunc('${unit}', ${column}), '${format}')`;
  }

  private formatJobDateKey(date: Date, bucket: AdminJobGrowthBucket): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    if (bucket === AdminJobGrowthBucket.MONTH) {
      return `${year}-${month}`;
    }
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async reviewJob(admin: AuthUser, id: string, dto: ReviewJobDto): Promise<JobResponseDto> {
    this.assertAdmin(admin);
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) {
      throw this.jobNotFound();
    }
    if (!ACTIVE_REVIEW_STATUSES.includes(job.status)) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.JOB_NOT_EDITABLE,
        message: 'Only jobs waiting for review can be reviewed',
      });
    }
    if (dto.decision === JobReviewDecision.REJECT && !dto.reason?.trim()) {
      throw new BadRequestException({
        code: ERROR_CODES.JOB.REVIEW_DECISION_REASON_REQUIRED,
        message: 'Rejecting a job requires a reason',
      });
    }
    if (
      dto.decision === JobReviewDecision.APPROVE &&
      job.companyStatus !== CompanyStatusSnapshot.APPROVED
    ) {
      throw new ForbiddenException({
        code: ERROR_CODES.JOB.COMPANY_NOT_APPROVED,
        message: 'Company must be approved before a job can be published',
      });
    }

    job.status =
      dto.decision === JobReviewDecision.APPROVE ? JobStatus.PUBLISHED : JobStatus.REJECTED;
    job.reviewedByUserId = admin.id;
    job.reviewedAt = new Date();
    job.reviewReason = dto.reason?.trim() || null;
    if (job.status === JobStatus.PUBLISHED) {
      job.publishedAt = job.publishedAt ?? new Date();
    }

    const saved = await this.jobRepo.save(job);
    await this.invalidatePublicCache();
    await this.markLatestReview(saved.id, saved.id, admin, dto);
    if (saved.status === JobStatus.PUBLISHED) {
      await this.jobEventPublisher.publishJobPublished({
        jobId: saved.id,
        companyId: saved.companyId,
        version: saved.version,
        publishedAt: saved.publishedAt?.toISOString(),
      });
    }
    await this.jobEventPublisher.publishReviewTrustSignal({
      companyId: saved.companyId,
      jobId: saved.id,
      targetType: JobModerationTargetType.JOB,
      targetId: saved.id,
      decision: dto.decision,
      riskLevel: saved.riskLevel,
      riskScore: saved.riskScore,
      reviewedAt: saved.reviewedAt?.toISOString(),
    });
    this.logger.log(
      `Job reviewed jobId=${saved.id} decision=${dto.decision} finalStatus=${saved.status} adminId=${admin.id}`,
    );
    return this.mapJob(saved);
  }

  async listRevisionReviewQueue(
    query: AdminJobRevisionReviewQueueQueryDto,
  ): Promise<Paginated<JobRevisionResponseDto>> {
    const reviewStatuses = [
      JobRevisionStatus.PENDING_REVIEW,
      JobRevisionStatus.NEEDS_REVIEW,
      JobRevisionStatus.SHOULD_REJECT,
    ];
    const qb = this.revisionRepo
      .createQueryBuilder('revision')
      .where('revision.status IN (:...statuses)', {
        statuses: query.status ? [query.status] : reviewStatuses,
      })
      .andWhere('"revision"."deleted_at" IS NULL')
      .orderBy('revision.createdAt', 'ASC')
      .skip(query.skip)
      .take(query.limit);

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('revision.title ILIKE :search', { search: `%${search}%` })
            .orWhere('revision.changeSummary ILIKE :search', { search: `%${search}%` })
            .orWhere('revision.companyId::text ILIKE :search', { search: `%${search}%` })
            .orWhere('revision.jobId::text ILIKE :search', { search: `%${search}%` });
        }),
      );
    }

    const [revisions, total] = await qb.getManyAndCount();
    return this.paginate(
      revisions.map((revision) => this.mapRevision(revision)),
      query.page,
      query.limit,
      total,
    );
  }

  async reviewRevision(
    admin: AuthUser,
    revisionId: string,
    dto: ReviewJobDto,
  ): Promise<JobRevisionResponseDto> {
    this.assertAdmin(admin);
    const revision = await this.revisionRepo.findOne({ where: { id: revisionId } });
    if (!revision) {
      throw new NotFoundException({
        code: ERROR_CODES.JOB.REVISION_NOT_FOUND,
        message: 'Job revision was not found',
      });
    }
    if (
      ![
        JobRevisionStatus.PENDING_REVIEW,
        JobRevisionStatus.NEEDS_REVIEW,
        JobRevisionStatus.SHOULD_REJECT,
      ].includes(revision.status)
    ) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.REVISION_NOT_EDITABLE,
        message: 'Only revisions waiting for review can be reviewed',
      });
    }
    if (dto.decision === JobReviewDecision.REJECT && !dto.reason?.trim()) {
      throw new BadRequestException({
        code: ERROR_CODES.JOB.REVIEW_DECISION_REASON_REQUIRED,
        message: 'Rejecting a revision requires a reason',
      });
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      revision.status =
        dto.decision === JobReviewDecision.APPROVE
          ? JobRevisionStatus.APPROVED
          : JobRevisionStatus.REJECTED;
      revision.reviewedByUserId = admin.id;
      revision.reviewedAt = new Date();
      revision.reviewReason = dto.reason?.trim() || null;
      const savedRevision = await manager.save(JobRevision, revision);

      if (dto.decision === JobReviewDecision.APPROVE) {
        const job = await manager.findOneByOrFail(Job, { id: revision.jobId });
        if (job.companyStatus !== CompanyStatusSnapshot.APPROVED) {
          throw new ForbiddenException({
            code: ERROR_CODES.JOB.COMPANY_NOT_APPROVED,
            message: 'Company must be approved before a revision can be published',
          });
        }
        Object.assign(job, this.jobInput(revision));
        Object.assign(job, this.searchTextService.buildSearchFields(revision, job.companyName));
        job.version += 1;
        await manager.save(Job, job);
        await this.invalidatePublicCache();
      }

      await this.markLatestReviewTx(
        manager.getRepository(JobModerationReview),
        revision.jobId,
        revision.id,
        admin,
        dto,
      );
      return savedRevision;
    });

    if (saved.status === JobRevisionStatus.APPROVED) {
      await this.jobEventPublisher.publishRevisionApproved({
        jobId: saved.jobId,
        companyId: saved.companyId,
        revisionId: saved.id,
        approvedAt: saved.reviewedAt?.toISOString(),
      });
    }
    await this.jobEventPublisher.publishReviewTrustSignal({
      companyId: saved.companyId,
      jobId: saved.jobId,
      targetType: JobModerationTargetType.REVISION,
      targetId: saved.id,
      decision: dto.decision,
      riskLevel: saved.riskLevel,
      riskScore: saved.riskScore,
      reviewedAt: saved.reviewedAt?.toISOString(),
    });
    this.logger.log(
      `Job revision reviewed revisionId=${saved.id} jobId=${saved.jobId} decision=${dto.decision} finalStatus=${saved.status} adminId=${admin.id}`,
    );

    return this.mapRevision(saved);
  }

  async syncCompanyPostingSnapshot(payload: CompanyPostingSnapshotChangedPayload): Promise<void> {
    const snapshotAt = payload.changedAt ? new Date(payload.changedAt) : new Date();
    const snapshotPatch: Partial<Job> = {
      companyStatus: payload.companyStatus,
      companySnapshotAt: snapshotAt,
    };
    if (payload.companyName !== undefined) {
      snapshotPatch.companyName = payload.companyName;
    }
    if (payload.companyLogoUrl !== undefined) {
      snapshotPatch.companyLogoUrl = payload.companyLogoUrl;
    }
    if (payload.companyLogoDocumentId !== undefined) {
      snapshotPatch.companyLogoDocumentId = payload.companyLogoDocumentId;
    }
    if (payload.companyTrustLevel !== undefined) {
      snapshotPatch.companyTrustLevel = payload.companyTrustLevel;
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(CompanyPostingSnapshot).upsert(
        {
          companyId: payload.companyId,
          companyName: payload.companyName ?? null,
          companyLogoUrl: payload.companyLogoUrl ?? null,
          companyLogoDocumentId: payload.companyLogoDocumentId ?? null,
          companyStatus: payload.companyStatus,
          companyTrustLevel: payload.companyTrustLevel ?? CompanyTrustLevel.MEDIUM,
          snapshotAt,
        },
        ['companyId'],
      );
      await manager.update(Job, { companyId: payload.companyId }, snapshotPatch);
      await this.invalidatePublicCache();

      if (payload.companyName !== undefined) {
        const jobs = await manager.find(Job, { where: { companyId: payload.companyId } });
        for (const job of jobs) {
          Object.assign(
            job,
            this.searchTextService.buildSearchFields(job, payload.companyName ?? null),
          );
        }
        await manager.save(Job, jobs);
      }

      if (payload.companyStatus !== CompanyStatusSnapshot.APPROVED) {
        await manager
          .createQueryBuilder()
          .update(Job)
          .set({
            status: JobStatus.SHOULD_REJECT,
            reviewReason: COMPANY_STATUS_NOT_APPROVED_MESSAGE,
            publishedAt: null,
          })
          .where('company_id = :companyId', { companyId: payload.companyId })
          .andWhere('status IN (:...statuses)', {
            statuses: [JobStatus.PUBLISHED, ...ACTIVE_REVIEW_STATUSES],
          })
          .execute();

        await manager
          .createQueryBuilder()
          .update(JobRevision)
          .set({
            status: JobRevisionStatus.SHOULD_REJECT,
            reviewReason: COMPANY_STATUS_NOT_APPROVED_MESSAGE,
          })
          .where('company_id = :companyId', { companyId: payload.companyId })
          .andWhere('status IN (:...statuses)', {
            statuses: [
              JobRevisionStatus.PENDING_REVIEW,
              JobRevisionStatus.NEEDS_REVIEW,
              JobRevisionStatus.SHOULD_REJECT,
            ],
          })
          .execute();
      }
    });
    this.logger.log(
      `Company posting snapshot synced companyId=${payload.companyId} status=${payload.companyStatus}`,
    );
  }

  async recordApplicationSubmitted(payload: ApplicationSubmittedPayload): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const processedRepo = manager.getRepository(JobProcessedApplicationEvent);
      const existing = await processedRepo.findOne({
        where: { applicationId: payload.applicationId },
      });
      if (existing) {
        this.logger.log(
          `Application submitted event ignored applicationId=${payload.applicationId} reason=alreadyProcessed`,
        );
        return;
      }
      await processedRepo.save(
        processedRepo.create({
          applicationId: payload.applicationId,
          jobId: payload.jobId,
          candidateId: payload.candidateId,
        }),
      );
      await manager.increment(Job, { id: payload.jobId }, 'applicationCount', 1);
      await this.invalidatePublicCache();
    });
    this.logger.log(
      `Application submitted event processed applicationId=${payload.applicationId} jobId=${payload.jobId}`,
    );
  }

  async deleteMine(user: AuthUser, id: string): Promise<{ deleted: true }> {
    const job = await this.findCompanyJob(user, id);
    if (
      job.applicationCount > 0 ||
      ![JobStatus.DRAFT, JobStatus.REJECTED, JobStatus.UNPUBLISHED].includes(job.status)
    ) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.DELETE_NOT_ALLOWED,
        message: 'Only draft, rejected, or unpublished jobs without applications can be deleted',
      });
    }
    job.deletedAt = new Date();
    await this.jobRepo.save(job);
    await this.invalidatePublicCache();
    this.logger.log(
      `Job soft deleted jobId=${job.id} companyId=${job.companyId} userId=${user.id}`,
    );
    return { deleted: true };
  }

  async unpublishMine(user: AuthUser, id: string, dto: JobReasonDto): Promise<JobResponseDto> {
    const job = await this.findCompanyJob(user, id);
    return this.unpublishJob(job, user, dto.reason);
  }

  async republishMine(user: AuthUser, id: string): Promise<JobResponseDto> {
    const job = await this.findCompanyJob(user, id);
    return this.republishJob(job);
  }

  async closeMine(user: AuthUser, id: string, dto: JobReasonDto): Promise<JobResponseDto> {
    const job = await this.findCompanyJob(user, id);
    return this.closeJob(job, user, dto.reason);
  }

  async unpublishByAdmin(admin: AuthUser, id: string, dto: JobReasonDto): Promise<JobResponseDto> {
    this.assertAdmin(admin);
    if (!dto.reason?.trim()) {
      throw new BadRequestException({
        code: ERROR_CODES.JOB.REVIEW_DECISION_REASON_REQUIRED,
        message: 'Admin unpublish requires a reason',
      });
    }
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) {
      throw this.jobNotFound();
    }
    return this.unpublishJob(job, admin, dto.reason);
  }

  async republishByAdmin(admin: AuthUser, id: string): Promise<JobResponseDto> {
    this.assertAdmin(admin);
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) {
      throw this.jobNotFound();
    }
    return this.republishJob(job);
  }

  async closeByAdmin(admin: AuthUser, id: string, dto: JobReasonDto): Promise<JobResponseDto> {
    this.assertAdmin(admin);
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) {
      throw this.jobNotFound();
    }
    return this.closeJob(job, admin, dto.reason);
  }

  private async findCompanyJob(user: AuthUser, id: string): Promise<Job> {
    this.assertRecruiter(user);
    const job = await this.jobRepo.findOne({ where: { id, companyId: user.companyId } });
    if (!job) {
      throw this.jobNotFound();
    }
    return job;
  }

  private parsePublicLimit(
    value: string | undefined,
    defaultLimit: number,
    maxLimit: number,
  ): number {
    if (!value) {
      return defaultLimit;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return defaultLimit;
    }
    return Math.min(parsed, maxLimit);
  }

  private async findCompanyRevision(
    user: AuthUser,
    jobId: string,
    revisionId: string,
  ): Promise<JobRevision> {
    const revision = await this.revisionRepo.findOne({
      where: { id: revisionId, jobId, companyId: user.companyId },
    });
    if (!revision) {
      throw new NotFoundException({
        code: ERROR_CODES.JOB.REVISION_NOT_FOUND,
        message: 'Job revision was not found',
      });
    }
    return revision;
  }

  private async assertNoActiveRevision(jobId: string): Promise<void> {
    const existing = await this.revisionRepo.findOne({
      where: { jobId, status: In(ACTIVE_REVISION_STATUSES) },
    });
    if (existing) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.ACTIVE_REVISION_EXISTS,
        message: 'This job already has an active revision',
      });
    }
  }

  private assertRecruiter(user: AuthUser): void {
    if (user.role !== UserRole.RECRUITER || !user.companyId) {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'Only recruiters with a company can manage jobs',
      });
    }
  }

  private assertAdmin(user: AuthUser): void {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'Only admins can review jobs',
      });
    }
  }

  private assertJobInput(dto: UpdateJobDto): void {
    if (
      dto.salaryMin !== undefined &&
      dto.salaryMax !== undefined &&
      dto.salaryMin > dto.salaryMax
    ) {
      throw new BadRequestException({
        code: ERROR_CODES.JOB.INVALID_SALARY_RANGE,
        message: 'Minimum salary cannot be greater than maximum salary',
      });
    }
    if (dto.deadline && dto.deadline.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: ERROR_CODES.JOB.INVALID_DEADLINE,
        message: 'Job deadline must be in the future',
      });
    }
  }

  private hasMajorChange(job: Job, dto: UpdateJobDto): boolean {
    return MAJOR_FIELDS.some((field) => (job[field] ?? null) !== (dto[field] ?? null));
  }

  private jobInput(dto: UpdateJobDto | JobRevision) {
    return {
      title: dto.title.trim(),
      description: dto.description.trim(),
      requirements: dto.requirements.trim(),
      skills: this.searchTextService.normalizeSkills(dto.skills),
      benefits: dto.benefits?.trim() || null,
      categoryId: dto.categoryId ?? null,
      employmentType: dto.employmentType,
      workingType: dto.workingType,
      experienceLevel: dto.experienceLevel,
      location: dto.location.trim(),
      salaryMin: dto.salaryMin ?? null,
      salaryMax: dto.salaryMax ?? null,
      salaryCurrency: (dto.salaryCurrency ?? 'VND').toUpperCase(),
      isSalaryVisible: dto.isSalaryVisible ?? true,
      deadline: dto.deadline ?? null,
      numberOfOpenings: dto.numberOfOpenings ?? null,
    };
  }

  private revisionInput(dto: CreateJobRevisionDto) {
    return {
      ...this.jobInput(dto),
      changeSummary: dto.changeSummary?.trim() || null,
    };
  }

  private async unpublishJob(job: Job, user: AuthUser, reason?: string): Promise<JobResponseDto> {
    if (job.status !== JobStatus.PUBLISHED) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.UNPUBLISH_NOT_ALLOWED,
        message: 'Only published jobs can be unpublished',
      });
    }
    job.status = JobStatus.UNPUBLISHED;
    job.unpublishedByUserId = user.id;
    job.unpublishedAt = new Date();
    job.unpublishReason = reason?.trim() || null;
    const saved = await this.jobRepo.save(job);
    await this.invalidatePublicCache();
    await this.jobEventPublisher.publishJobUnpublished({
      jobId: saved.id,
      companyId: saved.companyId,
      unpublishedAt: saved.unpublishedAt?.toISOString(),
      reason: saved.unpublishReason,
    });
    this.logger.log(`Job unpublished jobId=${saved.id} byUserId=${user.id} status=${saved.status}`);
    return this.mapJob(saved);
  }

  private async republishJob(job: Job): Promise<JobResponseDto> {
    if (job.status !== JobStatus.UNPUBLISHED) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.REPUBLISH_NOT_ALLOWED,
        message: 'Only unpublished jobs can be republished',
      });
    }
    if (job.companyStatus !== CompanyStatusSnapshot.APPROVED) {
      throw new ForbiddenException({
        code: ERROR_CODES.JOB.COMPANY_NOT_APPROVED,
        message: 'Company must be approved before a job can be republished',
      });
    }
    job.status = JobStatus.PUBLISHED;
    job.unpublishedByUserId = null;
    job.unpublishedAt = null;
    job.unpublishReason = null;
    job.publishedAt = job.publishedAt ?? new Date();
    const saved = await this.jobRepo.save(job);
    await this.invalidatePublicCache();
    this.logger.log(`Job republished jobId=${saved.id} companyId=${saved.companyId}`);
    return this.mapJob(saved);
  }

  private async closeJob(job: Job, user: AuthUser, reason?: string): Promise<JobResponseDto> {
    if (![JobStatus.PUBLISHED, JobStatus.UNPUBLISHED].includes(job.status)) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.CLOSE_NOT_ALLOWED,
        message: 'Only published or unpublished jobs can be closed',
      });
    }
    const closedAt = new Date();
    job.status = JobStatus.CLOSED;
    job.closedAt = closedAt;
    job.reviewedByUserId = user.id;
    job.reviewReason = reason?.trim() || null;
    if (!job.unpublishedAt) {
      job.unpublishedByUserId = user.id;
      job.unpublishedAt = closedAt;
      job.unpublishReason = reason?.trim() || 'Job closed';
    }
    const saved = await this.jobRepo.save(job);
    await this.invalidatePublicCache();
    await this.jobEventPublisher.publishJobClosed({
      jobId: saved.id,
      companyId: saved.companyId,
      closedAt: saved.closedAt?.toISOString(),
      reason: saved.reviewReason,
    });
    this.logger.log(`Job closed jobId=${saved.id} byUserId=${user.id}`);
    return this.mapJob(saved);
  }

  private statusForDecision(decision: JobModerationDecision): JobStatus {
    if (decision === JobModerationDecision.SHOULD_REJECT) {
      return JobStatus.SHOULD_REJECT;
    }
    if (decision === JobModerationDecision.NEEDS_REVIEW) {
      return JobStatus.NEEDS_REVIEW;
    }
    return JobStatus.PENDING_REVIEW;
  }

  private revisionStatusForDecision(decision: JobModerationDecision): JobRevisionStatus {
    if (decision === JobModerationDecision.SHOULD_REJECT) {
      return JobRevisionStatus.SHOULD_REJECT;
    }
    if (decision === JobModerationDecision.NEEDS_REVIEW) {
      return JobRevisionStatus.NEEDS_REVIEW;
    }
    return JobRevisionStatus.PENDING_REVIEW;
  }

  private async recordModeration(
    repo: Repository<JobModerationReview>,
    input: {
      jobId: string;
      targetType: JobModerationTargetType;
      targetId: string;
      moderation: JobModerationResult;
    },
  ): Promise<void> {
    await repo.save(
      repo.create({
        jobId: input.jobId,
        targetType: input.targetType,
        targetId: input.targetId,
        riskScore: input.moderation.riskScore,
        riskLevel: input.moderation.riskLevel,
        decision: input.moderation.decision,
        reasons: input.moderation.reasons,
        matchedRules: input.moderation.matchedRules,
      }),
    );
  }

  private async markLatestReview(
    jobId: string,
    targetId: string,
    admin: AuthUser,
    dto: ReviewJobDto,
  ): Promise<void> {
    await this.markLatestReviewTx(this.moderationReviewRepo, jobId, targetId, admin, dto);
  }

  private async publishJobReviewRequired(job: Job): Promise<void> {
    if (!ACTIVE_REVIEW_STATUSES.includes(job.status)) {
      return;
    }
    await this.jobEventPublisher.publishJobReviewRequired({
      jobId: job.id,
      companyId: job.companyId,
      companyName: job.companyName,
      title: job.title,
      status: job.status,
      version: job.version,
      riskScore: job.riskScore,
      riskLevel: job.riskLevel,
      submittedAt: job.updatedAt?.toISOString(),
    });
  }

  private async publishJobRevisionReviewRequired(job: Job, revision: JobRevision): Promise<void> {
    if (!ACTIVE_REVISION_STATUSES.includes(revision.status)) {
      return;
    }
    await this.jobEventPublisher.publishJobRevisionReviewRequired({
      jobId: revision.jobId,
      companyId: revision.companyId,
      title: revision.title || job.title,
      revisionId: revision.id,
      status: revision.status,
      riskScore: revision.riskScore,
      riskLevel: revision.riskLevel,
      submittedAt: revision.updatedAt?.toISOString(),
    });
  }

  private async markLatestReviewTx(
    repo: Repository<JobModerationReview>,
    jobId: string,
    targetId: string,
    admin: AuthUser,
    dto: ReviewJobDto,
  ): Promise<void> {
    const review = await repo.findOne({
      where: { jobId, targetId },
      order: { createdAt: 'DESC' },
    });
    if (!review) {
      return;
    }
    review.reviewedByUserId = admin.id;
    review.reviewedAt = new Date();
    review.adminDecision = dto.decision;
    review.adminReason = dto.reason?.trim() || null;
    await repo.save(review);
  }

  private paginate<T>(data: T[], page: number, limit: number, total: number): Paginated<T> {
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private emptyJobStatusCounts(): RecruiterJobStatusCountsDto {
    return {
      [JobStatus.DRAFT]: 0,
      [JobStatus.PENDING_REVIEW]: 0,
      [JobStatus.NEEDS_REVIEW]: 0,
      [JobStatus.SHOULD_REJECT]: 0,
      [JobStatus.PUBLISHED]: 0,
      [JobStatus.UNPUBLISHED]: 0,
      [JobStatus.REJECTED]: 0,
      [JobStatus.CLOSED]: 0,
      [JobStatus.EXPIRED]: 0,
    };
  }

  private jobStatusCounts(
    rows: Array<{ status: JobStatus; count: string }>,
  ): Record<JobStatus, number> {
    const counts = this.emptyJobStatusCounts();
    for (const row of rows) {
      counts[row.status] = Number(row.count);
    }
    return counts;
  }

  private revisionStatusCounts(
    rows: Array<{ status: JobRevisionStatus; count: string }>,
  ): Record<JobRevisionStatus, number> {
    const counts = {
      [JobRevisionStatus.DRAFT]: 0,
      [JobRevisionStatus.PENDING_REVIEW]: 0,
      [JobRevisionStatus.NEEDS_REVIEW]: 0,
      [JobRevisionStatus.SHOULD_REJECT]: 0,
      [JobRevisionStatus.APPROVED]: 0,
      [JobRevisionStatus.REJECTED]: 0,
      [JobRevisionStatus.CANCELLED]: 0,
    };
    for (const row of rows) {
      counts[row.status] = Number(row.count);
    }
    return counts;
  }

  private mapJob(job: Job): JobResponseDto {
    return {
      id: job.id,
      companyId: job.companyId,
      companyName: job.companyName,
      companyLogoUrl: job.companyLogoUrl,
      companyLogoDocumentId: job.companyLogoDocumentId,
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      skills: job.skills,
      benefits: job.benefits,
      categoryId: job.categoryId,
      employmentType: job.employmentType,
      workingType: job.workingType,
      experienceLevel: job.experienceLevel,
      location: job.location,
      salaryMin: job.isSalaryVisible ? job.salaryMin : null,
      salaryMax: job.isSalaryVisible ? job.salaryMax : null,
      salaryCurrency: job.salaryCurrency,
      isSalaryVisible: job.isSalaryVisible,
      deadline: job.deadline,
      numberOfOpenings: job.numberOfOpenings,
      status: job.status,
      version: job.version,
      applicationCount: job.applicationCount,
      publishedAt: job.publishedAt,
      closedAt: job.closedAt,
      reviewedAt: job.reviewedAt,
      reviewReason: job.reviewReason,
      unpublishedAt: job.unpublishedAt,
      unpublishReason: job.unpublishReason,
      moderation: {
        riskScore: job.riskScore,
        riskLevel: job.riskLevel,
        decision: job.moderationDecision,
        reasons: job.moderationReasons,
        matchedRules: job.moderationMatchedRules,
      },
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private async mapPublicJobDetail(job: Job): Promise<PublicJobDetailDto> {
    return {
      id: job.id,
      companyId: job.companyId,
      companyName: job.companyName,
      companyLogoUrl: await this.resolveCompanyLogoUrl(job),
      companyLogoDocumentId: job.companyLogoDocumentId,
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      skills: job.skills,
      benefits: job.benefits,
      categoryId: job.categoryId,
      employmentType: job.employmentType,
      workingType: job.workingType,
      experienceLevel: job.experienceLevel,
      location: job.location,
      salaryMin: job.isSalaryVisible ? job.salaryMin : null,
      salaryMax: job.isSalaryVisible ? job.salaryMax : null,
      salaryCurrency: job.salaryCurrency,
      isSalaryVisible: job.isSalaryVisible,
      deadline: job.deadline,
      numberOfOpenings: job.numberOfOpenings,
      publishedAt: job.publishedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private async resolveCompanyLogoUrl(job: Job): Promise<string | null> {
    return this.resolveDocumentUrl(job.companyLogoDocumentId, job.companyLogoUrl);
  }

  private async resolveDocumentUrl(
    documentId: string | null,
    fallbackUrl: string | null,
  ): Promise<string | null> {
    if (!documentId) {
      return fallbackUrl;
    }

    try {
      const download = await this.documentClientService.createDownloadUrl(documentId);
      return download.url;
    } catch (error) {
      this.logger.warn(
        `Job company logo URL resolve failed documentId=${documentId}: ${(error as Error).message}`,
      );
      return fallbackUrl;
    }
  }

  private mapSavedSnapshot(job: Job): JobSavedSnapshotDto {
    return {
      id: job.id,
      companyId: job.companyId,
      companyName: job.companyName,
      companyLogoUrl: job.companyLogoUrl,
      companyLogoDocumentId: job.companyLogoDocumentId,
      title: job.title,
      status: job.status,
      experienceLevel: job.experienceLevel,
      location: job.location,
      salaryMin: job.isSalaryVisible ? job.salaryMin : null,
      salaryMax: job.isSalaryVisible ? job.salaryMax : null,
      salaryCurrency: job.salaryCurrency,
      isSalaryVisible: job.isSalaryVisible,
      deadline: job.deadline,
      publishedAt: job.publishedAt,
      isPublic: job.status === JobStatus.PUBLISHED,
    };
  }

  private mapRevision(revision: JobRevision): JobRevisionResponseDto {
    return {
      id: revision.id,
      jobId: revision.jobId,
      status: revision.status,
      title: revision.title,
      description: revision.description,
      requirements: revision.requirements,
      skills: revision.skills,
      benefits: revision.benefits,
      categoryId: revision.categoryId,
      employmentType: revision.employmentType,
      workingType: revision.workingType,
      experienceLevel: revision.experienceLevel,
      location: revision.location,
      salaryMin: revision.isSalaryVisible ? revision.salaryMin : null,
      salaryMax: revision.isSalaryVisible ? revision.salaryMax : null,
      salaryCurrency: revision.salaryCurrency,
      isSalaryVisible: revision.isSalaryVisible,
      deadline: revision.deadline,
      numberOfOpenings: revision.numberOfOpenings,
      changeSummary: revision.changeSummary,
      moderation: {
        riskScore: revision.riskScore,
        riskLevel: revision.riskLevel,
        decision: revision.moderationDecision,
        reasons: revision.moderationReasons,
        matchedRules: revision.moderationMatchedRules,
      },
      reviewedAt: revision.reviewedAt,
      reviewReason: revision.reviewReason,
      createdAt: revision.createdAt,
      updatedAt: revision.updatedAt,
    };
  }

  private jobNotFound(): NotFoundException {
    return new NotFoundException({
      code: ERROR_CODES.JOB.JOB_NOT_FOUND,
      message: 'Job was not found',
    });
  }

  private async getOrSetPublicCache<T>(keyParts: unknown[], loader: () => Promise<T>): Promise<T> {
    const cacheKey = await this.publicCacheKey(keyParts);
    const cached = await this.getPublicCache<T>(cacheKey);
    if (cached) {
      return cached;
    }

    const value = await loader();
    await this.setPublicCache(cacheKey, value);
    return value;
  }

  private async publicCacheKey(keyParts: unknown[]): Promise<string> {
    const version = await this.publicCacheVersion();
    return `job:public-cache:v${version}:${JSON.stringify(keyParts)}`;
  }

  private async publicCacheVersion(): Promise<string> {
    try {
      return (await this.redis.get(PUBLIC_JOB_CACHE_VERSION_KEY)) ?? '0';
    } catch (error) {
      this.logger.warn(`Redis public cache version read failed: ${(error as Error).message}`);
      return '0';
    }
  }

  private async getPublicCache<T>(cacheKey: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(cacheKey);
      return cached ? (JSON.parse(cached) as T) : null;
    } catch (error) {
      this.logger.warn(
        `Redis public cache read failed key=${cacheKey}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async setPublicCache<T>(cacheKey: string, value: T): Promise<void> {
    try {
      await this.redis.set(cacheKey, JSON.stringify(value), 'EX', PUBLIC_JOB_CACHE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(
        `Redis public cache write failed key=${cacheKey}: ${(error as Error).message}`,
      );
    }
  }

  private async invalidatePublicCache(): Promise<void> {
    try {
      await this.redis.incr(PUBLIC_JOB_CACHE_VERSION_KEY);
    } catch (error) {
      this.logger.warn(`Redis public cache invalidation failed: ${(error as Error).message}`);
    }
  }

  private cacheableQuery(query: PublicJobQueryDto): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  }
}
