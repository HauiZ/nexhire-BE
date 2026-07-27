import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AuthUser,
  CompanyStatus,
  ERROR_CODES,
  JobStatus,
  PaginationQueryDto,
  UserRole,
} from '@nexhire/shared';
import { Repository } from 'typeorm';
import { CandidateProfile } from '../candidate/entities/candidate-profile.entity';
import { DocumentClientService } from '../document-client/document-client.service';
import { JobSnapshotClient } from '../saved-job/job-snapshot.client';
import { CompanySnapshotClient } from './company-snapshot.client';
import {
  DeleteFollowedCompanyResponseDto,
  FollowedCompanyBatchStatusResponseDto,
  FollowedCompanyResponseDto,
  FollowedCompanyStatusResponseDto,
} from './dto/followed-company-response.dto';
import { FollowedCompany } from './entities/followed-company.entity';
import { FollowedCompanyEventPublisher } from './followed-company-event.publisher';

@Injectable()
export class FollowedCompanyService {
  private readonly logger = new Logger(FollowedCompanyService.name);

  constructor(
    private readonly companySnapshotClient: CompanySnapshotClient,
    private readonly documentClientService: DocumentClientService,
    private readonly jobSnapshotClient: JobSnapshotClient,
    private readonly eventPublisher: FollowedCompanyEventPublisher,
    @InjectRepository(CandidateProfile)
    private readonly candidateRepo: Repository<CandidateProfile>,
    @InjectRepository(FollowedCompany)
    private readonly followedCompanyRepo: Repository<FollowedCompany>,
  ) {}

  async listMine(user: AuthUser, query: PaginationQueryDto) {
    this.assertCandidate(user);
    const qb = this.followedCompanyRepo
      .createQueryBuilder('followedCompany')
      .where('followedCompany.candidateUserId = :candidateUserId', {
        candidateUserId: user.id,
      })
      .orderBy('followedCompany.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [followedCompanies, total] = await qb.getManyAndCount();
    return {
      data: await Promise.all(
        followedCompanies.map((followedCompany) => this.mapFollowedCompany(followedCompany)),
      ),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async followMine(user: AuthUser, companyId: string): Promise<FollowedCompanyResponseDto> {
    this.assertCandidate(user);
    const candidate = await this.getOrCreateCandidate(user.id);
    const existing = await this.followedCompanyRepo.findOne({
      where: { candidateId: candidate.id, companyId },
    });
    if (existing) {
      return this.mapFollowedCompany(existing);
    }

    const snapshot = await this.companySnapshotClient.getPostingSnapshot(companyId);
    if (snapshot.companyStatus !== CompanyStatus.APPROVED) {
      throw new ConflictException({
        code: ERROR_CODES.JOB.COMPANY_NOT_APPROVED,
        message: 'Only approved companies can be followed',
      });
    }

    const followedCompanyInput = this.followedCompanyRepo.create({
      candidateId: candidate.id,
      candidateUserId: user.id,
      companyId: snapshot.companyId,
      companyName: snapshot.companyName,
      companyLogoUrl: snapshot.companyLogoUrl,
      companyLogoDocumentId: snapshot.companyLogoDocumentId,
    });
    const followedCompany = await this.saveOrReturnExisting(
      candidate.id,
      snapshot.companyId,
      followedCompanyInput,
    );
    this.logger.log(`Followed company candidateUserId=${user.id} companyId=${companyId}`);
    return this.mapFollowedCompany(followedCompany);
  }

  async unfollowMine(user: AuthUser, companyId: string): Promise<DeleteFollowedCompanyResponseDto> {
    this.assertCandidate(user);
    await this.followedCompanyRepo.delete({ candidateUserId: user.id, companyId });
    this.logger.log(`Unfollowed company candidateUserId=${user.id} companyId=${companyId}`);
    return { deleted: true };
  }

  async getMineStatus(
    user: AuthUser,
    companyId: string,
  ): Promise<FollowedCompanyStatusResponseDto> {
    this.assertCandidate(user);
    const followed = await this.followedCompanyRepo.exist({
      where: { candidateUserId: user.id, companyId },
    });
    return { followed };
  }

  async getMineBatchStatus(
    user: AuthUser,
    companyIds: string[],
  ): Promise<FollowedCompanyBatchStatusResponseDto> {
    this.assertCandidate(user);
    const uniqueCompanyIds = [...new Set(companyIds)];
    const followedCompanies = await this.followedCompanyRepo
      .createQueryBuilder('followedCompany')
      .select('followedCompany.companyId', 'companyId')
      .where('followedCompany.candidateUserId = :candidateUserId', {
        candidateUserId: user.id,
      })
      .andWhere('followedCompany.companyId IN (:...companyIds)', {
        companyIds: uniqueCompanyIds,
      })
      .getRawMany<{ companyId: string }>();

    return {
      followedCompanyIds: followedCompanies.map((followedCompany) => followedCompany.companyId),
    };
  }

  async notifyFollowersAboutPublishedJob(payload: {
    jobId: string;
    companyId: string;
    publishedAt?: string;
  }): Promise<void> {
    const followers = await this.followedCompanyRepo.find({
      where: { companyId: payload.companyId },
      select: { candidateUserId: true },
    });
    const candidateUserIds = [...new Set(followers.map((follower) => follower.candidateUserId))];
    if (candidateUserIds.length === 0) {
      return;
    }

    const snapshot = await this.jobSnapshotClient.getSavedSnapshot(payload.jobId);
    if (!snapshot.isPublic || snapshot.status !== JobStatus.PUBLISHED) {
      return;
    }

    await this.eventPublisher.publishJobPublished({
      jobId: snapshot.id,
      jobTitle: snapshot.title,
      companyId: snapshot.companyId,
      companyName: snapshot.companyName,
      companyLogoUrl: snapshot.companyLogoUrl,
      companyLogoDocumentId: snapshot.companyLogoDocumentId,
      experienceLevel: snapshot.experienceLevel,
      location: snapshot.location,
      salaryMin: snapshot.salaryMin,
      salaryMax: snapshot.salaryMax,
      salaryCurrency: snapshot.salaryCurrency,
      isSalaryVisible: snapshot.isSalaryVisible,
      publishedAt: payload.publishedAt ?? this.toIso(snapshot.publishedAt),
      candidateUserIds,
    });
    this.logger.log(
      `Published followed company notifications jobId=${payload.jobId} followers=${candidateUserIds.length}`,
    );
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
        message: 'Only candidates can manage followed companies',
      });
    }
  }

  private async saveOrReturnExisting(
    candidateId: string,
    companyId: string,
    followedCompany: FollowedCompany,
  ): Promise<FollowedCompany> {
    try {
      return await this.followedCompanyRepo.save(followedCompany);
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
      const existing = await this.followedCompanyRepo.findOne({
        where: { candidateId, companyId },
      });
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

  private async mapFollowedCompany(
    followedCompany: FollowedCompany,
  ): Promise<FollowedCompanyResponseDto> {
    return {
      id: followedCompany.id,
      companyId: followedCompany.companyId,
      companyName: followedCompany.companyName,
      companyLogoUrl: await this.resolveCompanyLogoUrl(followedCompany),
      companyLogoDocumentId: followedCompany.companyLogoDocumentId,
      followedAt: followedCompany.createdAt,
    };
  }

  private async resolveCompanyLogoUrl(followedCompany: FollowedCompany): Promise<string | null> {
    if (!followedCompany.companyLogoDocumentId) {
      return followedCompany.companyLogoUrl;
    }

    try {
      const download = await this.documentClientService.createDownloadUrl(
        followedCompany.companyLogoDocumentId,
      );
      return download.url;
    } catch (error) {
      this.logger.warn(
        `Followed company logo resolve failed companyId=${followedCompany.companyId} documentId=${followedCompany.companyLogoDocumentId}: ${(error as Error).message}`,
      );
      return followedCompany.companyLogoUrl;
    }
  }

  private toIso(value: string | Date | null): string | null {
    if (!value) {
      return null;
    }
    return value instanceof Date ? value.toISOString() : value;
  }
}
