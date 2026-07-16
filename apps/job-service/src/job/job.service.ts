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
import {
  AuthUser,
  ERROR_CODES,
  JobModerationDecision,
  JobModerationRiskLevel,
  JobRevisionStatus,
  JobReviewDecision,
  JobStatus,
  UserRole,
} from '@nexhire/shared';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import { CompanySnapshotService } from './company/company-snapshot.service';
import {
  CreateJobDto,
  CreateJobRevisionDto,
  UpdateJobDto,
  UpdateJobRevisionDto,
} from './dto/job-input.dto';
import {
  AdminJobReviewQueueQueryDto,
  PublicJobQueryDto,
  RecruiterJobRevisionQueryDto,
  RecruiterJobQueryDto,
} from './dto/job-query.dto';
import { JobReasonDto, ReviewJobDto } from './dto/job-review.dto';
import {
  JobResponseDto,
  JobApplicationSnapshotDto,
  JobSavedSnapshotDto,
  JobRevisionResponseDto,
  PublicJobDetailDto,
  PublicJobListItemDto,
} from './dto/job-response.dto';
import { JobModerationReview } from './entities/job-moderation-review.entity';
import { JobProcessedApplicationEvent } from './entities/job-processed-application-event.entity';
import { JobRevision } from './entities/job-revision.entity';
import { Job } from './entities/job.entity';
import {
  CompanyStatusSnapshot,
  CompanyTrustLevel,
  JobModerationTargetType,
} from './entities/job.enum';
import { JobEventPublisher } from './events/job-event.publisher';
import { JobModerationResult, JobModerationService } from './moderation/job-moderation.service';
import { JobSearchTextService } from './search/job-search-text.service';
import { JOB_SEARCH_PROVIDER, JobSearchProvider, Paginated } from './search/job-search.types';

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
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    @InjectRepository(JobRevision)
    private readonly revisionRepo: Repository<JobRevision>,
    @InjectRepository(JobModerationReview)
    private readonly moderationReviewRepo: Repository<JobModerationReview>,
  ) {}

  async listPublic(query: PublicJobQueryDto): Promise<Paginated<PublicJobListItemDto>> {
    return this.jobSearchProvider.searchPublicJobs(query);
  }

  async listPublicByCompany(
    companyId: string,
    query: PublicJobQueryDto,
  ): Promise<Paginated<PublicJobListItemDto>> {
    return this.jobSearchProvider.searchPublicCompanyJobs(companyId, query);
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

  async listRevisionReviewQueue(): Promise<JobRevisionResponseDto[]> {
    const revisions = await this.revisionRepo.find({
      where: {
        status: In([
          JobRevisionStatus.PENDING_REVIEW,
          JobRevisionStatus.NEEDS_REVIEW,
          JobRevisionStatus.SHOULD_REJECT,
        ]),
      },
      order: { createdAt: 'ASC' },
    });
    return revisions.map((revision) => this.mapRevision(revision));
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
      await manager.update(Job, { companyId: payload.companyId }, snapshotPatch);

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

  private mapPublicJobDetail(job: Job): PublicJobDetailDto {
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
      publishedAt: job.publishedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
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
}
