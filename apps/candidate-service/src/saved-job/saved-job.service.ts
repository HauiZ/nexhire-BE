import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthUser, ERROR_CODES, JobStatus, PaginationQueryDto, UserRole } from '@nexhire/shared';
import { Repository } from 'typeorm';
import { CandidateProfile } from '../candidate/entities/candidate-profile.entity';
import {
  DeleteSavedJobResponseDto,
  SavedJobBatchStatusResponseDto,
  SavedJobResponseDto,
  SavedJobStatusResponseDto,
} from './dto/saved-job-response.dto';
import { SavedJob } from './entities/saved-job.entity';
import { JobSnapshotClient, SavedJobSnapshot } from './job-snapshot.client';

@Injectable()
export class SavedJobService {
  private readonly logger = new Logger(SavedJobService.name);

  constructor(
    private readonly jobSnapshotClient: JobSnapshotClient,
    @InjectRepository(CandidateProfile)
    private readonly candidateRepo: Repository<CandidateProfile>,
    @InjectRepository(SavedJob)
    private readonly savedJobRepo: Repository<SavedJob>,
  ) {}

  async listMine(user: AuthUser, query: PaginationQueryDto) {
    this.assertCandidate(user);
    const qb = this.savedJobRepo
      .createQueryBuilder('savedJob')
      .where('savedJob.candidateUserId = :candidateUserId', { candidateUserId: user.id })
      .orderBy('savedJob.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [savedJobs, total] = await qb.getManyAndCount();
    return {
      data: savedJobs.map((savedJob) => this.mapSavedJob(savedJob)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async saveMine(user: AuthUser, jobId: string): Promise<SavedJobResponseDto> {
    this.assertCandidate(user);
    const candidate = await this.getOrCreateCandidate(user.id);
    const existing = await this.savedJobRepo.findOne({
      where: { candidateId: candidate.id, jobId },
    });
    if (existing) {
      return this.mapSavedJob(existing);
    }

    const snapshot = await this.jobSnapshotClient.getSavedSnapshot(jobId);
    if (!snapshot.isPublic || snapshot.status !== JobStatus.PUBLISHED) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.JOB_NOT_PUBLIC,
        message: 'Only published jobs can be saved',
      });
    }

    const savedJobInput = this.savedJobRepo.create({
      candidateId: candidate.id,
      candidateUserId: user.id,
      jobId: snapshot.id,
      jobTitle: snapshot.title,
      companyId: snapshot.companyId,
      companyName: snapshot.companyName,
      companyLogoUrl: snapshot.companyLogoUrl,
      companyLogoDocumentId: snapshot.companyLogoDocumentId,
      jobStatus: snapshot.status,
      experienceLevel: snapshot.experienceLevel,
      location: snapshot.location,
      salaryMin: snapshot.salaryMin,
      salaryMax: snapshot.salaryMax,
      salaryCurrency: snapshot.salaryCurrency,
      isSalaryVisible: snapshot.isSalaryVisible,
      deadline: this.toDate(snapshot.deadline),
      publishedAt: this.toDate(snapshot.publishedAt),
    });
    const savedJob = await this.saveOrReturnExisting(candidate.id, snapshot.id, savedJobInput);
    this.logger.log(`Saved job candidateUserId=${user.id} jobId=${jobId}`);
    return this.mapSavedJob(savedJob);
  }

  async unsaveMine(user: AuthUser, jobId: string): Promise<DeleteSavedJobResponseDto> {
    this.assertCandidate(user);
    await this.savedJobRepo.delete({ candidateUserId: user.id, jobId });
    this.logger.log(`Unsaved job candidateUserId=${user.id} jobId=${jobId}`);
    return { deleted: true };
  }

  async getMineStatus(user: AuthUser, jobId: string): Promise<SavedJobStatusResponseDto> {
    this.assertCandidate(user);
    const saved = await this.savedJobRepo.exist({
      where: { candidateUserId: user.id, jobId },
    });
    return { saved };
  }

  async getMineBatchStatus(
    user: AuthUser,
    jobIds: string[],
  ): Promise<SavedJobBatchStatusResponseDto> {
    this.assertCandidate(user);
    const uniqueJobIds = [...new Set(jobIds)];
    const savedJobs = await this.savedJobRepo
      .createQueryBuilder('savedJob')
      .select('savedJob.jobId', 'jobId')
      .where('savedJob.candidateUserId = :candidateUserId', { candidateUserId: user.id })
      .andWhere('savedJob.jobId IN (:...jobIds)', { jobIds: uniqueJobIds })
      .getRawMany<{ jobId: string }>();

    return {
      savedJobIds: savedJobs.map((savedJob) => savedJob.jobId),
    };
  }

  private async getOrCreateCandidate(userId: string): Promise<CandidateProfile> {
    const existing = await this.candidateRepo.findOne({ where: { userId } });
    if (existing) {
      return existing;
    }
    return this.candidateRepo.save(
      this.candidateRepo.create({
        userId,
        fullName: null,
        phone: null,
        contactEmail: null,
        avatarDocumentId: null,
        headline: null,
        summary: null,
        location: null,
        portfolioUrl: null,
        linkedinUrl: null,
      }),
    );
  }

  private assertCandidate(user: AuthUser): void {
    if (user.role !== UserRole.CANDIDATE) {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'Only candidates can manage saved jobs',
      });
    }
  }

  private async saveOrReturnExisting(
    candidateId: string,
    jobId: string,
    savedJob: SavedJob,
  ): Promise<SavedJob> {
    try {
      return await this.savedJobRepo.save(savedJob);
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
      const existing = await this.savedJobRepo.findOne({ where: { candidateId, jobId } });
      if (existing) {
        return existing;
      }
      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }

  private mapSavedJob(savedJob: SavedJob): SavedJobResponseDto {
    return {
      id: savedJob.id,
      jobId: savedJob.jobId,
      title: savedJob.jobTitle,
      companyId: savedJob.companyId,
      companyName: savedJob.companyName,
      companyLogoUrl: savedJob.companyLogoUrl,
      companyLogoDocumentId: savedJob.companyLogoDocumentId,
      status: savedJob.jobStatus,
      experienceLevel: savedJob.experienceLevel,
      location: savedJob.location,
      salaryMin: savedJob.salaryMin,
      salaryMax: savedJob.salaryMax,
      salaryCurrency: savedJob.salaryCurrency,
      isSalaryVisible: savedJob.isSalaryVisible,
      deadline: savedJob.deadline,
      publishedAt: savedJob.publishedAt,
      savedAt: savedJob.createdAt,
    };
  }

  private toDate(value: string | Date | null): Date | null {
    if (!value) {
      return null;
    }
    return value instanceof Date ? value : new Date(value);
  }
}
