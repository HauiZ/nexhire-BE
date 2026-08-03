import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApplicationStage, AuthUser, ERROR_CODES, ParsedResume, UserRole } from '@nexhire/shared';
import { Brackets, In, Repository } from 'typeorm';
import {
  ApplicationInternalClientService,
  MatchRequestSnapshot,
} from './application-internal-client.service';
import {
  CreateApplicationDto,
  UpdateApplicationMatchSnapshotDto,
  UpdateApplicationStageDto,
  WithdrawApplicationDto,
} from './dto/application-input.dto';
import {
  CandidateApplicationQueryDto,
  RecruiterApplicationQueryDto,
  RecruiterApplicationStatsQueryDto,
} from './dto/application-query.dto';
import {
  ApplicationCvDownloadDto,
  ApplicationResponseDto,
  RecruiterApplicationDailyStatsDto,
  RecruiterApplicationStatsDto,
  RecruiterApplicationStatusCountsDto,
} from './dto/application-response.dto';
import { CvDocumentRetentionResponseDto } from './dto/cv-document-retention.dto';
import { Application } from './entities/application.entity';
import { ApplicationMatchLevel } from './entities/application.entity';
import { ApplicationEventPublisher } from './events/application-event.publisher';

@Injectable()
export class ApplicationService {
  private readonly logger = new Logger(ApplicationService.name);
  private readonly activeStatuses = [ApplicationStage.SUBMITTED, ApplicationStage.OFFERED];

  constructor(
    private readonly internalClient: ApplicationInternalClientService,
    private readonly applicationEventPublisher: ApplicationEventPublisher,
    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,
  ) {}

  async create(user: AuthUser, dto: CreateApplicationDto): Promise<ApplicationResponseDto> {
    this.assertCandidate(user);

    const [job, candidate] = await Promise.all([
      this.internalClient.getJobApplicationSnapshot(dto.jobId),
      this.internalClient.getCandidateApplicationSnapshot(user.id, dto.candidateCvId),
    ]);
    const cvDocument = await this.internalClient.getDocumentDownload(candidate.cvDocumentId);

    if (!job.isApplyable) {
      this.logger.warn(`Apply rejected: job not applicable jobId=${job.id} userId=${user.id}`);
      throw new ConflictException({
        code: ERROR_CODES.APPLICATION.JOB_NOT_APPLICABLE,
        message: 'This job is not accepting applications',
      });
    }

    const existing = await this.applicationRepo.findOne({
      where: {
        jobId: job.id,
        candidateUserId: user.id,
        status: In(this.activeStatuses),
      },
    });
    if (existing) {
      this.logger.warn(
        `Apply rejected: duplicate active application applicationId=${existing.id} jobId=${job.id} userId=${user.id}`,
      );
      throw new ConflictException({
        code: ERROR_CODES.APPLICATION.DUPLICATE_ACTIVE_APPLICATION,
        message: 'Candidate already has an active application for this job',
      });
    }

    const now = new Date();
    const application = await this.applicationRepo.save(
      this.applicationRepo.create({
        jobId: job.id,
        jobTitle: job.title,
        companyId: job.companyId,
        companyName: job.companyName,
        companyLogoUrl: job.companyLogoUrl,
        companyLogoDocumentId: job.companyLogoDocumentId,
        candidateId: candidate.candidateId,
        candidateUserId: candidate.candidateUserId,
        candidateFullName: candidate.fullName,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone,
        candidateAvatarDocumentId: candidate.avatarDocumentId,
        candidateCvId: candidate.candidateCvId,
        cvDocumentId: candidate.cvDocumentId,
        cvTitle: candidate.cvTitle,
        cvFileName: cvDocument.fileName,
        cvMimeType: cvDocument.mimeType,
        cvSize: cvDocument.size,
        cvParseStatus: candidate.cvParseStatus,
        coverLetter: dto.coverLetter?.trim() || null,
        status: ApplicationStage.SUBMITTED,
        statusNote: null,
        matchScore: null,
        matchLevel: null,
        submittedAt: now,
        withdrawnAt: null,
        decidedAt: null,
        cancelledAt: null,
      }),
    );

    await this.applicationEventPublisher.publishApplicationSubmitted({
      applicationId: application.id,
      jobId: application.jobId,
      jobTitle: application.jobTitle,
      candidateId: application.candidateId,
      candidateUserId: application.candidateUserId,
      candidateCvId: application.candidateCvId,
      cvDocumentId: application.cvDocumentId,
      candidateFullName: application.candidateFullName,
      candidateAvatarDocumentId: application.candidateAvatarDocumentId,
      companyId: application.companyId,
      companyName: application.companyName,
      companyLogoUrl: application.companyLogoUrl,
      companyLogoDocumentId: application.companyLogoDocumentId,
      submittedAt: application.submittedAt.toISOString(),
    });
    this.logger.log(
      `Application submitted applicationId=${application.id} jobId=${application.jobId} candidateUserId=${application.candidateUserId}`,
    );
    await this.queueMatchingWhenCvReady(application);

    return this.mapApplication(application);
  }

  async listMine(user: AuthUser, query: CandidateApplicationQueryDto) {
    this.assertCandidate(user);
    const qb = this.applicationRepo
      .createQueryBuilder('application')
      .where('application.candidateUserId = :candidateUserId', { candidateUserId: user.id })
      .orderBy('application.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    if (query.status) {
      qb.andWhere('application.status = :status', { status: query.status });
    }

    const [applications, total] = await qb.getManyAndCount();
    return this.paginate(
      await Promise.all(applications.map((application) => this.mapApplication(application))),
      query.page,
      query.limit,
      total,
    );
  }

  async getMine(user: AuthUser, id: string): Promise<ApplicationResponseDto> {
    this.assertCandidate(user);
    return this.mapApplication(await this.findMine(user, id));
  }

  async withdrawMine(
    user: AuthUser,
    id: string,
    dto: WithdrawApplicationDto,
  ): Promise<ApplicationResponseDto> {
    this.assertCandidate(user);
    const application = await this.findMine(user, id);
    if (![ApplicationStage.SUBMITTED, ApplicationStage.OFFERED].includes(application.status)) {
      throw this.invalidTransition();
    }

    const previousStatus = application.status;
    application.status = ApplicationStage.WITHDRAWN;
    application.statusNote = dto.note?.trim() || null;
    application.withdrawnAt = new Date();
    const saved = await this.applicationRepo.save(application);
    await this.publishStageChanged(saved, previousStatus);
    this.logger.log(
      `Application withdrawn applicationId=${saved.id} previousStatus=${previousStatus} candidateUserId=${user.id}`,
    );
    return this.mapApplication(saved);
  }

  async listCompany(user: AuthUser, query: RecruiterApplicationQueryDto) {
    this.assertRecruiter(user);
    const qb = this.applicationRepo
      .createQueryBuilder('application')
      .where('application.companyId = :companyId', { companyId: user.companyId })
      .orderBy('application.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    if (query.jobId) {
      qb.andWhere('application.jobId = :jobId', { jobId: query.jobId });
    }
    if (query.status) {
      qb.andWhere('application.status = :status', { status: query.status });
    }
    if (query.search?.trim()) {
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('application.candidateFullName ILIKE :search', {
              search: `%${query.search!.trim()}%`,
            })
            .orWhere('application.candidateEmail ILIKE :search', {
              search: `%${query.search!.trim()}%`,
            })
            .orWhere('application.jobTitle ILIKE :search', {
              search: `%${query.search!.trim()}%`,
            });
        }),
      );
    }

    const [applications, total] = await qb.getManyAndCount();
    return this.paginate(
      await Promise.all(applications.map((application) => this.mapApplication(application))),
      query.page,
      query.limit,
      total,
    );
  }

  async getCompanyApplication(user: AuthUser, id: string): Promise<ApplicationResponseDto> {
    return this.mapApplication(await this.findCompanyApplication(user, id));
  }

  async requestCompanyApplicationMatch(
    user: AuthUser,
    id: string,
  ): Promise<MatchRequestSnapshot> {
    const application = await this.findCompanyApplication(user, id);
    return this.requestMatchWhenCvReady(application, user.id, 'RECRUITER_MANUAL');
  }

  async handleCvParsedForMatching(payload: {
    candidateCvId: string;
    normalizedPayload: ParsedResume;
  }): Promise<void> {
    const applications = await this.applicationRepo.find({
      where: {
        candidateCvId: payload.candidateCvId,
        status: In(this.activeStatuses),
      },
      order: { submittedAt: 'ASC' },
    });

    for (const application of applications) {
      if (application.cvParseStatus !== 'PARSED') {
        application.cvParseStatus = 'PARSED';
        await this.applicationRepo.save(application);
      }
      await this.createMatchRequestForApplication(
        application,
        application.candidateUserId,
        payload.normalizedPayload,
        'AUTO_APPLICATION',
      );
    }
  }

  async handleCvParseFailedForMatching(payload: {
    candidateCvId: string;
    errorMessage?: string;
  }): Promise<void> {
    const applications = await this.applicationRepo.find({
      where: {
        candidateCvId: payload.candidateCvId,
        status: In(this.activeStatuses),
        cvParseStatus: 'PARSING',
      },
      order: { submittedAt: 'ASC' },
    });

    for (const application of applications) {
      application.cvParseStatus = 'FAILED';
      await this.applicationRepo.save(application);
      this.logger.warn(
        `Application matching CV parse failed applicationId=${application.id} candidateCvId=${application.candidateCvId}: ${payload.errorMessage ?? 'unknown error'}`,
      );
    }
  }

  async getRecruiterStats(
    user: AuthUser,
    query: RecruiterApplicationStatsQueryDto,
  ): Promise<RecruiterApplicationStatsDto> {
    this.assertRecruiter(user);
    const { from, to } = this.resolveStatsWindow(query);

    const statusRows = await this.applicationRepo
      .createQueryBuilder('application')
      .select('application.status', 'status')
      .addSelect('COUNT(application.id)', 'count')
      .where('application.companyId = :companyId', { companyId: user.companyId })
      .andWhere('application.submittedAt >= :from', { from })
      .andWhere('application.submittedAt <= :to', { to })
      .groupBy('application.status')
      .getRawMany<{ status: ApplicationStage; count: string }>();

    const byStatus = this.emptyApplicationStatusCounts();
    for (const row of statusRows) {
      byStatus[row.status] = Number(row.count);
    }

    const dayRows = await this.applicationRepo
      .createQueryBuilder('application')
      .select(`TO_CHAR(DATE("application"."submitted_at"), 'YYYY-MM-DD')`, 'date')
      .addSelect('application.status', 'status')
      .addSelect('COUNT(application.id)', 'count')
      .where('application.companyId = :companyId', { companyId: user.companyId })
      .andWhere('application.submittedAt >= :from', { from })
      .andWhere('application.submittedAt <= :to', { to })
      .groupBy('date')
      .addGroupBy('application.status')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; status: ApplicationStage; count: string }>();

    const byDay = this.buildDailyStats(from, to, dayRows);
    const total = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
    const responded = byStatus.OFFERED + byStatus.REJECTED;
    return {
      total,
      byStatus,
      byDay,
      responseRate: total > 0 ? Math.round((responded / total) * 100) : 0,
    };
  }

  async updateCompanyStage(
    user: AuthUser,
    id: string,
    dto: UpdateApplicationStageDto,
  ): Promise<ApplicationResponseDto> {
    const application = await this.findCompanyApplication(user, id);
    if (![ApplicationStage.OFFERED, ApplicationStage.REJECTED].includes(dto.status)) {
      throw new BadRequestException({
        code: ERROR_CODES.APPLICATION.INVALID_STAGE_TRANSITION,
        message: 'Recruiters can only mark applications as offered or rejected',
      });
    }
    if (![ApplicationStage.SUBMITTED, ApplicationStage.OFFERED].includes(application.status)) {
      throw this.invalidTransition();
    }
    if (application.status === dto.status) {
      application.statusNote = dto.note?.trim() || application.statusNote;
      const saved = await this.applicationRepo.save(application);
      this.logger.log(
        `Application note updated applicationId=${saved.id} status=${saved.status} recruiterUserId=${user.id}`,
      );
      return this.mapApplication(saved);
    }

    const previousStatus = application.status;
    application.status = dto.status;
    application.statusNote = dto.note?.trim() || null;
    application.decidedAt = new Date();
    const saved = await this.applicationRepo.save(application);
    await this.publishStageChanged(saved, previousStatus);
    this.logger.log(
      `Application stage changed applicationId=${saved.id} ${previousStatus}->${saved.status} recruiterUserId=${user.id}`,
    );
    return this.mapApplication(saved);
  }

  async getMineCvDownload(user: AuthUser, id: string): Promise<ApplicationCvDownloadDto> {
    this.assertCandidate(user);
    return this.getCvDownload(await this.findMine(user, id));
  }

  async getCompanyCvDownload(user: AuthUser, id: string): Promise<ApplicationCvDownloadDto> {
    return this.getCvDownload(await this.findCompanyApplication(user, id));
  }

  async handleJobUnpublished(payload: JobLifecyclePayload): Promise<void> {
    // Existing applications remain actionable for recruiters.
    this.logger.log(
      `Job unpublished event received jobId=${payload.jobId}; applications unchanged`,
    );
  }

  async handleJobClosed(payload: JobLifecyclePayload): Promise<void> {
    const applications = await this.applicationRepo.find({
      where: { jobId: payload.jobId, status: In(this.activeStatuses) },
    });
    for (const application of applications) {
      const previousStatus = application.status;
      application.status = ApplicationStage.CANCELLED;
      application.statusNote = payload.reason?.trim() || 'Job was closed';
      application.cancelledAt = new Date();
      const saved = await this.applicationRepo.save(application);
      await this.publishStageChanged(saved, previousStatus);
    }
    this.logger.log(
      `Job closed event processed jobId=${payload.jobId} cancelledApplications=${applications.length}`,
    );
  }

  async syncCandidateProfileSnapshot(
    payload: CandidateProfileSnapshotChangedPayload,
  ): Promise<void> {
    const result = await this.applicationRepo.update(
      { candidateUserId: payload.candidateUserId },
      {
        candidateFullName: payload.fullName ?? null,
        candidateEmail: payload.email ?? null,
        candidatePhone: payload.phone ?? null,
        candidateAvatarDocumentId: payload.avatarDocumentId ?? null,
      },
    );
    this.logger.log(
      `Candidate application snapshot synced candidateUserId=${payload.candidateUserId} affected=${result?.affected ?? 0}`,
    );
  }

  async getCvDocumentRetention(
    documentId: string,
    terminalBefore?: string,
  ): Promise<CvDocumentRetentionResponseDto> {
    const terminalCutoff = terminalBefore ? new Date(terminalBefore) : new Date();
    const terminalStatuses = [
      ApplicationStage.REJECTED,
      ApplicationStage.WITHDRAWN,
      ApplicationStage.CANCELLED,
    ];

    const [activeApplicationCount, recentTerminalApplicationCount, blockingApplication] =
      await Promise.all([
        this.applicationRepo.count({
          where: {
            cvDocumentId: documentId,
            status: In(this.activeStatuses),
          },
        }),
        this.applicationRepo
          .createQueryBuilder('application')
          .where('application.cvDocumentId = :documentId', { documentId })
          .andWhere('application.status IN (:...terminalStatuses)', { terminalStatuses })
          .andWhere(
            'COALESCE(application.decidedAt, application.withdrawnAt, application.cancelledAt, application.updatedAt) >= :terminalCutoff',
            { terminalCutoff },
          )
          .getCount(),
        this.applicationRepo.findOne({
          where: [
            { cvDocumentId: documentId, status: In(this.activeStatuses) },
            { cvDocumentId: documentId, status: In(terminalStatuses) },
          ],
          order: { updatedAt: 'DESC' },
        }),
      ]);

    return {
      documentId,
      canDelete: activeApplicationCount === 0 && recentTerminalApplicationCount === 0,
      activeApplicationCount,
      recentTerminalApplicationCount,
      blockingStatus:
        activeApplicationCount > 0 || recentTerminalApplicationCount > 0
          ? (blockingApplication?.status ?? null)
          : null,
    };
  }

  async updateMatchSnapshot(
    id: string,
    dto: UpdateApplicationMatchSnapshotDto,
  ): Promise<ApplicationResponseDto> {
    const application = await this.applicationRepo.findOne({ where: { id } });
    if (!application) {
      throw this.notFound();
    }
    application.matchScore = dto.matchScore;
    application.matchLevel = dto.matchLevel ?? this.matchLevelForScore(dto.matchScore);
    const saved = await this.applicationRepo.save(application);
    this.logger.log(
      `Application match snapshot updated applicationId=${id} score=${saved.matchScore} level=${saved.matchLevel}`,
    );
    return this.mapApplication(saved);
  }

  private async queueMatchingWhenCvReady(application: Application): Promise<void> {
    try {
      await this.requestMatchWhenCvReady(
        application,
        application.candidateUserId,
        'AUTO_APPLICATION',
      );
    } catch (error) {
      this.logger.warn(
        `Failed to queue matching prerequisite applicationId=${application.id}: ${(error as Error).message}`,
      );
    }
  }

  private async requestMatchWhenCvReady(
    application: Application,
    requestedByUserId: string,
    requestType: 'AUTO_APPLICATION' | 'RECRUITER_MANUAL',
  ): Promise<MatchRequestSnapshot> {
    if (application.cvParseStatus === 'PARSED') {
      try {
        const parsedResult = await this.internalClient.getLatestCvParseResult(
          application.candidateCvId,
        );
        return this.createMatchRequestForApplication(
          application,
          requestedByUserId,
          parsedResult.normalizedPayload,
          requestType,
        );
      } catch (error) {
        if (!this.isMissingCvParseResult(error)) {
          throw error;
        }
        this.logger.warn(
          `Application matching could not find parsed CV result, requesting reparse applicationId=${application.id} candidateCvId=${application.candidateCvId}`,
        );
      }
    }

    if (application.cvParseStatus === 'PARSING') {
      this.logger.log(
        `Application matching waits for CV parsing applicationId=${application.id} candidateCvId=${application.candidateCvId}`,
      );
      return this.waitingForCvParseSnapshot(application, requestType);
    }

    const cv = await this.internalClient.requestCandidateCvParse({
      candidateId: application.candidateId,
      candidateCvId: application.candidateCvId,
      requestedByUserId,
      ...(application.cvParseStatus === 'PARSED' ? { force: true } : {}),
    });
    if (application.cvParseStatus !== cv.parseStatus) {
      application.cvParseStatus = cv.parseStatus;
      await this.applicationRepo.save(application);
    }
    this.logger.log(
      `Requested CV parsing before matching applicationId=${application.id} candidateCvId=${application.candidateCvId}`,
    );
    return this.waitingForCvParseSnapshot(application, requestType);
  }

  private waitingForCvParseSnapshot(
    application: Application,
    requestType: 'AUTO_APPLICATION' | 'RECRUITER_MANUAL',
  ): MatchRequestSnapshot {
    return {
      id: null,
      applicationId: application.id,
      status: 'WAITING_FOR_CV_PARSE',
      requestType,
    };
  }

  private async createMatchRequestForApplication(
    application: Application,
    requestedByUserId: string,
    parsedResume: ParsedResume,
    requestType: 'AUTO_APPLICATION' | 'RECRUITER_MANUAL',
  ): Promise<MatchRequestSnapshot> {
    return this.internalClient.createApplicationMatchRequest({
      id: application.id,
      jobId: application.jobId,
      candidateId: application.candidateId,
      candidateUserId: application.candidateUserId,
      candidateCvId: application.candidateCvId,
      cvDocumentId: application.cvDocumentId,
      requestedByUserId,
      requestType,
      parsedResume,
    });
  }

  private isMissingCvParseResult(error: unknown): boolean {
    if (!(error instanceof HttpException)) {
      return false;
    }
    const response = error.getResponse();
    if (typeof response === 'string') {
      return false;
    }
    const body = this.unwrapErrorBody(response as Record<string, unknown>);
    return (
      body.code === ERROR_CODES.COMMON.NOT_FOUND &&
      body.message?.toLowerCase().includes('parsed cv result') === true
    );
  }

  private unwrapErrorBody(response: Record<string, unknown>): { code?: string; message?: string } {
    const nestedError = response.error;
    if (nestedError && typeof nestedError === 'object') {
      return nestedError as { code?: string; message?: string };
    }
    return response as { code?: string; message?: string };
  }

  private async getCvDownload(application: Application): Promise<ApplicationCvDownloadDto> {
    const document = await this.internalClient.getDocumentDownload(application.cvDocumentId);
    return {
      documentId: document.id,
      fileName: document.fileName,
      mimeType: document.mimeType,
      size: document.size,
      url: document.url,
      expiresInSeconds: document.expiresInSeconds,
    };
  }

  private async findMine(user: AuthUser, id: string): Promise<Application> {
    const application = await this.applicationRepo.findOne({
      where: { id, candidateUserId: user.id },
    });
    if (!application) {
      throw this.notFound();
    }
    return application;
  }

  private async findCompanyApplication(user: AuthUser, id: string): Promise<Application> {
    this.assertRecruiter(user);
    const application = await this.applicationRepo.findOne({
      where: { id, companyId: user.companyId },
    });
    if (!application) {
      throw this.notFound();
    }
    return application;
  }

  private async publishStageChanged(
    application: Application,
    previousStatus: ApplicationStage,
  ): Promise<void> {
    await this.applicationEventPublisher.publishApplicationStageChanged({
      applicationId: application.id,
      jobId: application.jobId,
      jobTitle: application.jobTitle,
      companyId: application.companyId,
      companyName: application.companyName,
      companyLogoUrl: application.companyLogoUrl,
      companyLogoDocumentId: application.companyLogoDocumentId,
      candidateId: application.candidateId,
      candidateUserId: application.candidateUserId,
      candidateFullName: application.candidateFullName,
      candidateAvatarDocumentId: application.candidateAvatarDocumentId,
      previousStatus,
      status: application.status,
      note: application.statusNote,
      changedAt: new Date().toISOString(),
    });
  }

  private assertCandidate(user: AuthUser): void {
    if (user.role !== UserRole.CANDIDATE) {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'Only candidates can manage their applications',
      });
    }
  }

  private assertRecruiter(user: AuthUser): void {
    if (user.role !== UserRole.RECRUITER || !user.companyId) {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'Only recruiters with a company can manage applications',
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ERROR_CODES.APPLICATION.APPLICATION_NOT_FOUND,
      message: 'Application not found',
    });
  }

  private invalidTransition(): ConflictException {
    return new ConflictException({
      code: ERROR_CODES.APPLICATION.INVALID_STAGE_TRANSITION,
      message: 'Application status transition is not allowed',
    });
  }

  private paginate<T>(data: T[], page: number, limit: number, total: number) {
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

  private async mapApplication(application: Application): Promise<ApplicationResponseDto> {
    return {
      id: application.id,
      jobId: application.jobId,
      jobTitle: application.jobTitle,
      companyId: application.companyId,
      companyName: application.companyName,
      companyLogoUrl: application.companyLogoUrl,
      companyLogoDocumentId: application.companyLogoDocumentId,
      candidateId: application.candidateId,
      candidateUserId: application.candidateUserId,
      candidateFullName: application.candidateFullName,
      candidateEmail: application.candidateEmail,
      candidatePhone: application.candidatePhone,
      candidateAvatarDocumentId: application.candidateAvatarDocumentId,
      candidateAvatarUrl: await this.resolveAvatarUrl(application.candidateAvatarDocumentId),
      candidateCvId: application.candidateCvId,
      cvDocumentId: application.cvDocumentId,
      cvTitle: application.cvTitle,
      cvFileName: application.cvFileName,
      cvMimeType: application.cvMimeType,
      cvSize: application.cvSize,
      cvParseStatus: application.cvParseStatus,
      coverLetter: application.coverLetter,
      status: application.status,
      statusNote: application.statusNote,
      matchScore: application.matchScore,
      matchLevel: application.matchLevel,
      submittedAt: application.submittedAt,
      withdrawnAt: application.withdrawnAt,
      decidedAt: application.decidedAt,
      cancelledAt: application.cancelledAt,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
  }

  private async resolveAvatarUrl(documentId: string | null): Promise<string | null> {
    if (!documentId) {
      return null;
    }
    try {
      const document = await this.internalClient.getDocumentDownload(documentId);
      return document.url;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve candidate avatar URL documentId=${documentId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private resolveStatsWindow(query: RecruiterApplicationStatsQueryDto): {
    from: Date;
    to: Date;
  } {
    const now = new Date();
    const to = query.to ? this.parseDateQuery(query.to) : now;
    to.setHours(23, 59, 59, 999);
    const from = query.from
      ? this.parseDateQuery(query.from)
      : new Date(to.getTime() - 5 * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'from must be before or equal to to',
      });
    }
    return { from, to };
  }

  private parseDateQuery(value: string): Date {
    const [year, month, day] = value.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private emptyApplicationStatusCounts(): RecruiterApplicationStatusCountsDto {
    return {
      [ApplicationStage.SUBMITTED]: 0,
      [ApplicationStage.OFFERED]: 0,
      [ApplicationStage.REJECTED]: 0,
      [ApplicationStage.WITHDRAWN]: 0,
      [ApplicationStage.CANCELLED]: 0,
    };
  }

  private buildDailyStats(
    from: Date,
    to: Date,
    rows: Array<{ date: string; status: ApplicationStage; count: string }>,
  ): RecruiterApplicationDailyStatsDto[] {
    const byDate = new Map<string, RecruiterApplicationDailyStatsDto>();
    for (const date of this.dateRange(from, to)) {
      byDate.set(date, {
        date,
        submitted: 0,
        offered: 0,
        rejected: 0,
        withdrawn: 0,
        cancelled: 0,
      });
    }
    for (const row of rows) {
      const bucket = byDate.get(row.date);
      if (!bucket) {
        continue;
      }
      bucket[this.dailyStatusKey(row.status)] = Number(row.count);
    }
    return [...byDate.values()];
  }

  private dateRange(from: Date, to: Date): string[] {
    const dates: string[] = [];
    const cursor = new Date(from);
    while (cursor.getTime() <= to.getTime()) {
      dates.push(this.formatDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private dailyStatusKey(
    status: ApplicationStage,
  ): keyof Omit<RecruiterApplicationDailyStatsDto, 'date'> {
    switch (status) {
      case ApplicationStage.OFFERED:
        return 'offered';
      case ApplicationStage.REJECTED:
        return 'rejected';
      case ApplicationStage.WITHDRAWN:
        return 'withdrawn';
      case ApplicationStage.CANCELLED:
        return 'cancelled';
      case ApplicationStage.SUBMITTED:
      default:
        return 'submitted';
    }
  }

  private matchLevelForScore(score: number): ApplicationMatchLevel {
    if (score >= 90) {
      return ApplicationMatchLevel.EXCELLENT;
    }
    if (score >= 75) {
      return ApplicationMatchLevel.HIGH;
    }
    if (score >= 50) {
      return ApplicationMatchLevel.MEDIUM;
    }
    return ApplicationMatchLevel.LOW;
  }
}

export interface JobLifecyclePayload {
  jobId: string;
  companyId?: string;
  reason?: string | null;
  closedAt?: string;
  unpublishedAt?: string;
}

export interface CandidateProfileSnapshotChangedPayload {
  candidateId: string;
  candidateUserId: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarDocumentId?: string | null;
  changedAt?: string;
}
