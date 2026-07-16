import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApplicationStage, AuthUser, ERROR_CODES, UserRole } from '@nexhire/shared';
import { Brackets, In, Repository } from 'typeorm';
import { ApplicationInternalClientService } from './application-internal-client.service';
import {
  CreateApplicationDto,
  UpdateApplicationStageDto,
  WithdrawApplicationDto,
} from './dto/application-input.dto';
import {
  CandidateApplicationQueryDto,
  RecruiterApplicationQueryDto,
} from './dto/application-query.dto';
import { ApplicationCvDownloadDto, ApplicationResponseDto } from './dto/application-response.dto';
import { Application } from './entities/application.entity';
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
    this.logger.log(`Job unpublished event received jobId=${payload.jobId}; applications unchanged`);
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
