import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AuthUser,
  CompanyStatus,
  CompanyTrustLevel,
  ERROR_CODES,
  JobModerationRiskLevel,
  JobReviewDecision,
  paginated,
} from '@nexhire/shared';
import { Brackets, Repository } from 'typeorm';
import { CompanyMapper } from './company.mapper';
import {
  AdminCompanyGrowthBucket,
  AdminCompanyGrowthDto,
  AdminCompanyGrowthPointDto,
  AdminCompanyGrowthQueryDto,
} from './dto/admin-company-growth.dto';
import { AdminCompanyOverviewDto } from './dto/admin-company-overview.dto';
import { AdminCompanyQueryDto, AdminCompanySort } from './dto/admin-company-query.dto';
import { AdminCompanyResponseDto } from './dto/admin-company-response.dto';
import { UpdateCompanyTrustLevelDto } from './dto/company-admin-action.dto';
import { CompanyPostingSnapshotDto } from './dto/company-posting-snapshot.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CompanyTrustHistoryResponseDto } from './dto/company-trust-history-response.dto';
import {
  AttachCompanyVerificationDocumentDto,
  CompanyVerificationDocumentDownloadResponseDto,
  CompanyVerificationDocumentResponseDto,
  CompanyVerificationDocumentWithMetadataResponseDto,
} from './dto/company-verification-document.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { PublicCompanyProfileDto } from './dto/public-company-profile.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { VerifyAction } from './dto/verify-company.dto';
import { CompanyProcessedTrustSignal } from './entities/company-processed-trust-signal.entity';
import {
  CompanyTrustChangeDirection,
  CompanyTrustChangeSource,
  CompanyTrustHistory,
} from './entities/company-trust-history.entity';
import { CompanyVerificationDocument } from './entities/company-verification-document.entity';
import { Company } from './entities/company.entity';
import { CompanyEventPublisher } from './events/company-event.publisher';
import { DocumentClientService } from '../document-client/document-client.service';
import {
  COMPANY_HERO_IMAGE_MAX_UPLOAD_SIZE_BYTES,
  COMPANY_HERO_IMAGE_MIME_TYPES,
  COMPANY_LOGO_MAX_UPLOAD_SIZE_BYTES,
  COMPANY_LOGO_MIME_TYPES,
} from '../document-client/document-upload.constants';
import { CompanyUploadedFile } from '../document-client/interfaces/company-uploaded-file.interface';

const POSITIVE_TRUST_SIGNAL_THRESHOLD = 5;
const NEGATIVE_TRUST_SIGNAL_THRESHOLD = 3;

interface AdminCompanyGrowthRange {
  from: Date;
  to: Date;
  toExclusive: Date;
  bucket: AdminCompanyGrowthBucket;
}

export interface JobReviewTrustSignalPayload {
  companyId: string;
  jobId: string;
  targetType: 'JOB' | 'REVISION';
  targetId: string;
  decision: JobReviewDecision;
  riskLevel: JobModerationRiskLevel | null;
  riskScore: number | null;
  reviewedAt?: string;
}

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(CompanyTrustHistory)
    private readonly trustHistoryRepo: Repository<CompanyTrustHistory>,
    @InjectRepository(CompanyProcessedTrustSignal)
    private readonly processedTrustSignalRepo: Repository<CompanyProcessedTrustSignal>,
    @InjectRepository(CompanyVerificationDocument)
    private readonly verificationDocumentRepo: Repository<CompanyVerificationDocument>,
    private readonly companyEventPublisher: CompanyEventPublisher,
    private readonly documentClientService: DocumentClientService,
  ) {}

  async create(userId: string, dto: CreateCompanyDto): Promise<CompanyResponseDto> {
    const existing = await this.companyRepo.findOne({ where: { ownerId: userId } });
    if (existing) {
      throw new ConflictException({
        code: ERROR_CODES.COMPANY.ALREADY_EXISTS,
        message: 'You already have a company profile',
      });
    }

    const taxCode = this.normalizeTaxCode(dto.taxCode);
    const taxExists = await this.companyRepo.findOne({ where: { taxCode } });
    if (taxExists) {
      throw new ConflictException({
        code: ERROR_CODES.COMPANY.TAX_CODE_IN_USE,
        message: 'Tax code already in use',
      });
    }

    const company = this.companyRepo.create({
      ...dto,
      taxCode,
      ownerId: userId,
      status: CompanyStatus.PENDING,
      statusReason: null,
      statusChangedAt: null,
      statusChangedByUserId: null,
    });

    const saved = await this.companyRepo.save(company);
    await this.publishPostingSnapshot(saved);
    this.logger.log(`Company created companyId=${saved.id} ownerId=${userId}`);
    return this.toCompanyResponse(saved);
  }

  async uploadLogo(
    companyId: string,
    user: AuthUser,
    file?: CompanyUploadedFile,
  ): Promise<CompanyResponseDto> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException({
        code: ERROR_CODES.COMPANY.NOT_FOUND,
        message: `Company ${companyId} not found`,
      });
    }

    if (company.ownerId !== user.id) {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'You can only update your own company',
      });
    }

    if (!file) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_REQUIRED,
        message: 'Logo file is required',
      });
    }
    this.assertUploadedFile(file, COMPANY_LOGO_MIME_TYPES, COMPANY_LOGO_MAX_UPLOAD_SIZE_BYTES);

    const document = await this.documentClientService.uploadCompanyLogo(user, company.id, file);
    company.logoDocumentId = document.id;
    company.logo = null;
    const saved = await this.companyRepo.save(company);
    await this.publishPostingSnapshot(saved, company.status);
    this.logger.log(`Company logo uploaded companyId=${companyId} documentId=${document.id}`);
    return this.toCompanyResponse(saved);
  }

  async uploadHeroImage(
    companyId: string,
    user: AuthUser,
    file?: CompanyUploadedFile,
  ): Promise<CompanyResponseDto> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException({
        code: ERROR_CODES.COMPANY.NOT_FOUND,
        message: `Company ${companyId} not found`,
      });
    }

    if (company.ownerId !== user.id) {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'You can only update your own company',
      });
    }

    if (!file) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_REQUIRED,
        message: 'Hero image file is required',
      });
    }
    this.assertUploadedFile(
      file,
      COMPANY_HERO_IMAGE_MIME_TYPES,
      COMPANY_HERO_IMAGE_MAX_UPLOAD_SIZE_BYTES,
    );

    const document = await this.documentClientService.uploadCompanyHeroImage(
      user,
      company.id,
      file,
    );
    company.heroImageDocumentId = document.id;
    company.heroImageUrl = null;
    const saved = await this.companyRepo.save(company);
    this.logger.log(`Company hero image uploaded companyId=${companyId} documentId=${document.id}`);
    return this.toCompanyResponse(saved);
  }

  async findByOwner(userId: string): Promise<CompanyResponseDto> {
    const company = await this.companyRepo.findOne({ where: { ownerId: userId } });
    if (!company) {
      throw new NotFoundException({
        code: ERROR_CODES.COMPANY.NOT_FOUND,
        message: 'Company profile not found',
      });
    }
    return this.toCompanyResponse(company);
  }

  async update(
    companyId: string,
    userId: string,
    dto: UpdateCompanyDto,
  ): Promise<CompanyResponseDto> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException({
        code: ERROR_CODES.COMPANY.NOT_FOUND,
        message: `Company ${companyId} not found`,
      });
    }

    if (company.ownerId !== userId) {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'You can only update your own company',
      });
    }

    const patch = { ...dto };
    if (patch.taxCode !== undefined) {
      patch.taxCode = this.normalizeTaxCode(patch.taxCode);
      if (patch.taxCode !== company.taxCode) {
        const taxExists = await this.companyRepo.findOne({ where: { taxCode: patch.taxCode } });
        if (taxExists) {
          throw new ConflictException({
            code: ERROR_CODES.COMPANY.TAX_CODE_IN_USE,
            message: 'Tax code already in use',
          });
        }
      }
    }

    const previousStatus = company.status;
    if (patch.taxCode !== undefined || patch.name !== undefined) {
      company.status = CompanyStatus.PENDING;
      company.statusReason = null;
      company.statusChangedAt = new Date();
      company.statusChangedByUserId = userId;
      this.logger.log(`Company status reset to PENDING companyId=${companyId}`);
    }

    if (patch.logo !== undefined) {
      company.logoDocumentId = null;
    }
    if (patch.heroImageUrl !== undefined) {
      company.heroImageDocumentId = null;
    }

    Object.assign(company, patch);
    const saved = await this.companyRepo.save(company);
    await this.publishPostingSnapshot(saved, previousStatus);
    return this.toCompanyResponse(saved);
  }

  async getPending(): Promise<AdminCompanyResponseDto[]> {
    const companies = await this.companyRepo.find({
      where: { status: CompanyStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(companies.map((company) => this.toAdminCompanyResponse(company)));
  }

  async listAdmin(query: AdminCompanyQueryDto) {
    const qb = this.companyRepo.createQueryBuilder('company').skip(query.skip).take(query.limit);

    if (query.status) {
      qb.andWhere('company.status = :status', { status: query.status });
    }

    if (query.trustLevel) {
      qb.andWhere('company.trustLevel = :trustLevel', { trustLevel: query.trustLevel });
    }

    if (query.hasRejectedBefore === 'true') {
      qb.andWhere('company.verificationRejectedCount > 0');
    } else if (query.hasRejectedBefore === 'false') {
      qb.andWhere('company.verificationRejectedCount = 0');
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('company.name ILIKE :search', { search: `%${search}%` })
            .orWhere('company.taxCode ILIKE :search', { search: `%${search}%` })
            .orWhere('company.website ILIKE :search', { search: `%${search}%` })
            .orWhere('company.contactEmail ILIKE :search', { search: `%${search}%` })
            .orWhere('CAST("company"."owner_id" AS TEXT) ILIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    if (query.sort === AdminCompanySort.OLDEST) {
      qb.orderBy('company.createdAt', 'ASC');
    } else if (query.sort === AdminCompanySort.REJECTED_COUNT_DESC) {
      qb.orderBy('company.verificationRejectedCount', 'DESC').addOrderBy(
        'company.updatedAt',
        'DESC',
      );
    } else {
      qb.orderBy('company.createdAt', 'DESC');
    }

    const [companies, total] = await qb.getManyAndCount();
    return paginated(
      await Promise.all(companies.map((company) => this.toAdminCompanyResponse(company))),
      total,
      query.page,
      query.limit,
    );
  }

  async getAdminOverview(): Promise<AdminCompanyOverviewDto> {
    const [total, statusRows, trustRows, pendingReviewAgain, rejectedBefore] = await Promise.all([
      this.companyRepo.count(),
      this.companyRepo
        .createQueryBuilder('company')
        .select('company.status', 'status')
        .addSelect('COUNT(company.id)', 'count')
        .groupBy('company.status')
        .getRawMany<{ status: CompanyStatus; count: string }>(),
      this.companyRepo
        .createQueryBuilder('company')
        .select('company.trustLevel', 'trustLevel')
        .addSelect('COUNT(company.id)', 'count')
        .groupBy('company.trustLevel')
        .getRawMany<{ trustLevel: CompanyTrustLevel; count: string }>(),
      this.companyRepo
        .createQueryBuilder('company')
        .where('company.status = :status', { status: CompanyStatus.PENDING })
        .andWhere('company.verificationRejectedCount > 0')
        .getCount(),
      this.companyRepo
        .createQueryBuilder('company')
        .where('company.verificationRejectedCount > 0')
        .getCount(),
    ]);

    return {
      total,
      byStatus: this.companyStatusCounts(statusRows),
      byTrustLevel: this.companyTrustCounts(trustRows),
      pendingReviewAgain,
      rejectedBefore,
    };
  }

  async getAdminGrowth(query: AdminCompanyGrowthQueryDto): Promise<AdminCompanyGrowthDto> {
    const range = this.normalizeCompanyGrowthRange(query);
    const points = this.createCompanyGrowthPoints(range);
    const pointByBucket = new Map(points.map((point) => [point.bucket, point]));

    const [registeredRows, approvedRows, rejectedRows, suspendedRows, reviewAgainRows] =
      await Promise.all([
        this.countCompanyRows('"company"."created_at"', range),
        this.countCompanyStatusRows(CompanyStatus.APPROVED, range),
        this.countCompanyStatusRows(CompanyStatus.REJECTED, range),
        this.countCompanyStatusRows(CompanyStatus.SUSPENDED, range),
        this.countCompanyRows('"company"."verification_review_requested_at"', range),
      ]);

    this.applyCompanyGrowthRows(pointByBucket, registeredRows, 'registeredCompanies');
    this.applyCompanyGrowthRows(pointByBucket, approvedRows, 'approvedCompanies');
    this.applyCompanyGrowthRows(pointByBucket, rejectedRows, 'rejectedCompanies');
    this.applyCompanyGrowthRows(pointByBucket, suspendedRows, 'suspendedCompanies');
    this.applyCompanyGrowthRows(pointByBucket, reviewAgainRows, 'reviewRequestedAgain');

    return {
      from: this.formatCompanyDateKey(range.from, range.bucket),
      to: this.formatCompanyDateKey(range.to, range.bucket),
      bucket: range.bucket,
      points,
    };
  }

  private async countCompanyRows(
    column: string,
    range: AdminCompanyGrowthRange,
  ): Promise<Array<{ bucket: string; count: string }>> {
    return this.companyRepo
      .createQueryBuilder('company')
      .select(this.companyBucketSelect(column, range), 'bucket')
      .addSelect('COUNT("company"."id")', 'count')
      .where(`${column} >= :from`, { from: range.from })
      .andWhere(`${column} < :to`, { to: range.toExclusive })
      .groupBy('bucket')
      .getRawMany<{ bucket: string; count: string }>();
  }

  private async countCompanyStatusRows(
    status: CompanyStatus,
    range: AdminCompanyGrowthRange,
  ): Promise<Array<{ bucket: string; count: string }>> {
    return this.companyRepo
      .createQueryBuilder('company')
      .select(this.companyBucketSelect('"company"."status_changed_at"', range), 'bucket')
      .addSelect('COUNT("company"."id")', 'count')
      .where('"company"."status" = :status', { status })
      .andWhere('"company"."status_changed_at" >= :from', { from: range.from })
      .andWhere('"company"."status_changed_at" < :to', { to: range.toExclusive })
      .groupBy('bucket')
      .getRawMany<{ bucket: string; count: string }>();
  }

  private applyCompanyGrowthRows(
    pointByBucket: Map<string, AdminCompanyGrowthPointDto>,
    rows: Array<{ bucket: string; count: string }>,
    field: keyof Omit<AdminCompanyGrowthPointDto, 'bucket'>,
  ): void {
    for (const row of rows) {
      const point = pointByBucket.get(row.bucket);
      if (point) {
        point[field] = Number(row.count);
      }
    }
  }

  private createCompanyGrowthPoints(range: AdminCompanyGrowthRange): AdminCompanyGrowthPointDto[] {
    return this.createCompanyBucketKeys(range).map((bucket) => ({
      bucket,
      registeredCompanies: 0,
      approvedCompanies: 0,
      rejectedCompanies: 0,
      suspendedCompanies: 0,
      reviewRequestedAgain: 0,
    }));
  }

  private normalizeCompanyGrowthRange(query: AdminCompanyGrowthQueryDto): AdminCompanyGrowthRange {
    const bucket = query.bucket ?? AdminCompanyGrowthBucket.DAY;
    const now = new Date();
    const defaultTo = this.startOfUtcDay(now);
    const defaultFrom = new Date(defaultTo);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

    const from = query.from ? this.parseCompanyDateBoundary(query.from) : defaultFrom;
    const to = query.to ? this.parseCompanyDateBoundary(query.to) : defaultTo;
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'from must be before or equal to to',
      });
    }

    return {
      from,
      to,
      toExclusive: this.addCompanyBucket(to, bucket),
      bucket,
    };
  }

  private parseCompanyDateBoundary(value: string): Date {
    const parsed = new Date(value);
    return this.startOfUtcDay(parsed);
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private addCompanyBucket(date: Date, bucket: AdminCompanyGrowthBucket): Date {
    const next = new Date(date);
    if (bucket === AdminCompanyGrowthBucket.MONTH) {
      next.setUTCMonth(next.getUTCMonth() + 1);
    } else {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  private createCompanyBucketKeys(range: AdminCompanyGrowthRange): string[] {
    const keys: string[] = [];
    const cursor =
      range.bucket === AdminCompanyGrowthBucket.MONTH
        ? new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1))
        : new Date(range.from);
    const end =
      range.bucket === AdminCompanyGrowthBucket.MONTH
        ? new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), 1))
        : range.to;

    while (cursor.getTime() <= end.getTime()) {
      keys.push(this.formatCompanyDateKey(cursor, range.bucket));
      if (range.bucket === AdminCompanyGrowthBucket.MONTH) {
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      } else {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    return keys;
  }

  private companyBucketSelect(column: string, range: AdminCompanyGrowthRange): string {
    const unit = range.bucket === AdminCompanyGrowthBucket.MONTH ? 'month' : 'day';
    const format = range.bucket === AdminCompanyGrowthBucket.MONTH ? 'YYYY-MM' : 'YYYY-MM-DD';
    return `to_char(date_trunc('${unit}', ${column}), '${format}')`;
  }

  private formatCompanyDateKey(date: Date, bucket: AdminCompanyGrowthBucket): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    if (bucket === AdminCompanyGrowthBucket.MONTH) {
      return `${year}-${month}`;
    }
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async verify(
    companyId: string,
    action: VerifyAction,
    adminUserId?: string,
    reason?: string,
  ): Promise<AdminCompanyResponseDto> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException({
        code: ERROR_CODES.COMPANY.NOT_FOUND,
        message: `Company ${companyId} not found`,
      });
    }

    const previousStatus = company.status;
    const statusReason = reason?.trim() || null;
    const now = new Date();
    if (action === VerifyAction.APPROVE) {
      company.status = CompanyStatus.APPROVED;
      company.statusReason = null;
      company.verificationReviewRequestedAt = null;
      company.verificationReviewRequestedByUserId = null;
    } else if (action === VerifyAction.REJECT) {
      if (!statusReason) {
        throw new BadRequestException({
          code: ERROR_CODES.COMPANY.INVALID_VERIFY_ACTION,
          message: 'Rejecting a company requires a reason',
        });
      }
      company.status = CompanyStatus.REJECTED;
      company.statusReason = statusReason;
      company.verificationRejectedCount = (company.verificationRejectedCount ?? 0) + 1;
      company.lastVerificationRejectedReason = statusReason;
      company.lastVerificationRejectedAt = now;
      company.verificationReviewRequestedAt = null;
      company.verificationReviewRequestedByUserId = null;
    } else {
      throw new BadRequestException({
        code: ERROR_CODES.COMPANY.INVALID_VERIFY_ACTION,
        message: 'Invalid verify action',
      });
    }
    company.statusChangedAt = now;
    company.statusChangedByUserId = adminUserId ?? null;

    const saved = await this.companyRepo.save(company);
    await this.publishPostingSnapshot(saved, previousStatus);
    this.logger.log(`Company verified companyId=${companyId} action=${action}`);
    return this.toAdminCompanyResponse(saved);
  }

  async suspend(
    companyId: string,
    adminUserId?: string,
    reason?: string,
  ): Promise<AdminCompanyResponseDto> {
    const company = await this.findCompanyOrThrow(companyId);
    const previousStatus = company.status;
    company.status = CompanyStatus.SUSPENDED;
    company.statusReason = reason?.trim() || null;
    company.statusChangedAt = new Date();
    company.statusChangedByUserId = adminUserId ?? null;
    const saved = await this.companyRepo.save(company);
    await this.publishPostingSnapshot(saved, previousStatus);
    this.logger.log(`Company suspended companyId=${companyId}`);
    return this.toAdminCompanyResponse(saved);
  }

  async restore(
    companyId: string,
    adminUserId?: string,
    reason?: string,
  ): Promise<AdminCompanyResponseDto> {
    const company = await this.findCompanyOrThrow(companyId);
    const previousStatus = company.status;
    company.status = CompanyStatus.PENDING;
    company.statusReason = reason?.trim() || null;
    company.statusChangedAt = new Date();
    company.statusChangedByUserId = adminUserId ?? null;
    const saved = await this.companyRepo.save(company);
    await this.publishPostingSnapshot(saved, previousStatus);
    this.logger.log(`Company restored to pending companyId=${companyId}`);
    return this.toAdminCompanyResponse(saved);
  }

  async updateTrustLevel(
    companyId: string,
    adminUserId: string,
    dto: UpdateCompanyTrustLevelDto,
  ): Promise<AdminCompanyResponseDto> {
    const company = await this.findCompanyOrThrow(companyId);
    const previousStatus = company.status;
    const previousTrustLevel = company.trustLevel;
    company.trustLevel = dto.trustLevel;
    company.approvedLowRiskCount = 0;
    company.negativeTrustSignalCount = 0;
    const saved = await this.companyRepo.save(company);
    await this.recordTrustHistoryIfChanged({
      companyId: saved.id,
      previousTrustLevel,
      newTrustLevel: saved.trustLevel,
      source: CompanyTrustChangeSource.MANUAL,
      changedByUserId: adminUserId,
      reason: dto.reason.trim(),
      metadata: {},
    });
    await this.publishPostingSnapshot(saved, previousStatus);
    this.logger.log(
      `Company trust level updated companyId=${companyId} trustLevel=${dto.trustLevel} adminUserId=${adminUserId}`,
    );
    return this.toAdminCompanyResponse(saved);
  }

  async recordTrustSignal(payload: JobReviewTrustSignalPayload): Promise<void> {
    const company = await this.findCompanyOrThrow(payload.companyId);
    const shouldProcess = await this.tryRecordProcessedTrustSignal(payload);
    if (!shouldProcess) {
      this.logger.debug(
        `Duplicate trust signal ignored targetType=${payload.targetType} targetId=${payload.targetId}`,
      );
      return;
    }
    const previousTrustLevel = company.trustLevel;
    let autoReason: string | null = null;
    if (this.isPositiveTrustSignal(payload)) {
      company.approvedLowRiskCount += 1;
      company.negativeTrustSignalCount = 0;
      if (company.approvedLowRiskCount >= POSITIVE_TRUST_SIGNAL_THRESHOLD) {
        company.trustLevel = this.increaseTrustLevel(company.trustLevel);
        company.approvedLowRiskCount = 0;
        autoReason = `${POSITIVE_TRUST_SIGNAL_THRESHOLD} approved low-risk job reviews reached`;
      }
    } else if (this.isNegativeTrustSignal(payload)) {
      company.negativeTrustSignalCount += 1;
      company.approvedLowRiskCount = 0;
      if (company.negativeTrustSignalCount >= NEGATIVE_TRUST_SIGNAL_THRESHOLD) {
        company.trustLevel = this.decreaseTrustLevel(company.trustLevel);
        company.negativeTrustSignalCount = 0;
        autoReason = `${NEGATIVE_TRUST_SIGNAL_THRESHOLD} negative job review signals reached`;
      }
    } else {
      return;
    }

    const saved = await this.companyRepo.save(company);
    if (autoReason) {
      await this.recordTrustHistoryIfChanged({
        companyId: saved.id,
        previousTrustLevel,
        newTrustLevel: saved.trustLevel,
        source: CompanyTrustChangeSource.AUTO,
        changedByUserId: null,
        reason: autoReason,
        metadata: {
          jobId: payload.jobId,
          targetType: payload.targetType,
          targetId: payload.targetId,
          decision: payload.decision,
          riskLevel: payload.riskLevel,
          riskScore: payload.riskScore,
          reviewedAt: payload.reviewedAt ?? null,
          positiveThreshold: POSITIVE_TRUST_SIGNAL_THRESHOLD,
          negativeThreshold: NEGATIVE_TRUST_SIGNAL_THRESHOLD,
        },
      });
    }
    await this.publishPostingSnapshot(saved, company.status);
    this.logger.log(
      `Company trust signal recorded companyId=${company.id} trustLevel=${company.trustLevel} positive=${company.approvedLowRiskCount} negative=${company.negativeTrustSignalCount}`,
    );
  }

  async listTrustHistory(companyId: string): Promise<CompanyTrustHistoryResponseDto[]> {
    await this.findCompanyOrThrow(companyId);
    const histories = await this.trustHistoryRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });
    return histories.map(CompanyMapper.toTrustHistoryResponse);
  }

  async attachVerificationDocument(
    companyId: string,
    user: AuthUser,
    dto: AttachCompanyVerificationDocumentDto,
  ): Promise<CompanyVerificationDocumentResponseDto> {
    const company = await this.findCompanyOrThrow(companyId);
    this.assertCompanyOwner(company, user.id);
    await this.assertVerificationDocumentBelongsToCompany(company.id, dto.documentId);
    let document: CompanyVerificationDocument;
    try {
      document = await this.verificationDocumentRepo.save(
        this.verificationDocumentRepo.create({
          companyId: company.id,
          documentId: dto.documentId,
          type: dto.type,
          uploadedByUserId: user.id,
        }),
      );
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException({
          code: ERROR_CODES.COMMON.CONFLICT,
          message: 'Verification document already attached to this company',
        });
      }
      throw error;
    }
    this.logger.log(
      `Company verification document attached companyId=${companyId} documentId=${dto.documentId}`,
    );
    return CompanyMapper.toVerificationDocumentResponse(document);
  }

  async listVerificationDocuments(
    companyId: string,
    user: AuthUser,
  ): Promise<CompanyVerificationDocumentWithMetadataResponseDto[]> {
    const company = await this.findCompanyOrThrow(companyId);
    this.assertCompanyOwner(company, user.id);
    return this.listVerificationDocumentsWithMetadata(company.id);
  }

  async listAdminVerificationDocuments(
    companyId: string,
  ): Promise<CompanyVerificationDocumentWithMetadataResponseDto[]> {
    await this.findCompanyOrThrow(companyId);
    return this.listVerificationDocumentsWithMetadata(companyId);
  }

  async getVerificationDocumentDownload(
    companyId: string,
    documentId: string,
    user: AuthUser,
  ): Promise<CompanyVerificationDocumentDownloadResponseDto> {
    const company = await this.findCompanyOrThrow(companyId);
    this.assertCompanyOwner(company, user.id);
    return this.getVerificationDocumentDownloadForCompany(company.id, documentId);
  }

  async requestVerificationReview(companyId: string, user: AuthUser): Promise<CompanyResponseDto> {
    const company = await this.findCompanyOrThrow(companyId);
    this.assertCompanyOwner(company, user.id);

    if (company.status === CompanyStatus.PENDING) {
      return this.toCompanyResponse(company);
    }
    if (company.status === CompanyStatus.APPROVED) {
      throw new ConflictException({
        code: ERROR_CODES.COMMON.CONFLICT,
        message: 'Approved companies do not need another verification review',
      });
    }
    if (company.status === CompanyStatus.SUSPENDED) {
      throw new ConflictException({
        code: ERROR_CODES.COMMON.CONFLICT,
        message: 'Suspended companies must be restored by an admin before review',
      });
    }

    const hasVerificationDocument = await this.verificationDocumentRepo.findOne({
      where: { companyId: company.id },
    });
    if (!hasVerificationDocument) {
      throw new ConflictException({
        code: ERROR_CODES.COMMON.CONFLICT,
        message: 'At least one verification document is required before review',
      });
    }

    const previousStatus = company.status;
    const now = new Date();
    company.status = CompanyStatus.PENDING;
    company.statusReason = null;
    company.statusChangedAt = now;
    company.statusChangedByUserId = user.id;
    company.verificationReviewRequestedAt = now;
    company.verificationReviewRequestedByUserId = user.id;
    const saved = await this.companyRepo.save(company);
    await this.publishPostingSnapshot(saved, previousStatus);
    this.logger.log(`Company verification review requested companyId=${companyId}`);
    return this.toCompanyResponse(saved);
  }

  private async listVerificationDocumentsWithMetadata(
    companyId: string,
  ): Promise<CompanyVerificationDocumentWithMetadataResponseDto[]> {
    const documents = await this.verificationDocumentRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      documents.map(async (document) => {
        const metadata = await this.documentClientService.getDocumentMetadata(document.documentId);
        return {
          ...CompanyMapper.toVerificationDocumentResponse(document),
          documentType: metadata.documentType,
          fileName: metadata.fileName,
          mimeType: metadata.mimeType,
          size: metadata.size,
        };
      }),
    );
  }

  async getAdminVerificationDocumentDownload(
    companyId: string,
    documentId: string,
  ): Promise<CompanyVerificationDocumentDownloadResponseDto> {
    await this.findCompanyOrThrow(companyId);
    return this.getVerificationDocumentDownloadForCompany(companyId, documentId);
  }

  private async getVerificationDocumentDownloadForCompany(
    companyId: string,
    documentId: string,
  ): Promise<CompanyVerificationDocumentDownloadResponseDto> {
    const document = await this.verificationDocumentRepo.findOne({
      where: { companyId, documentId },
    });
    if (!document) {
      throw new NotFoundException({
        code: ERROR_CODES.COMMON.NOT_FOUND,
        message: 'Verification document not found',
      });
    }
    const download = await this.documentClientService.getDocumentDownload(documentId);
    return {
      ...CompanyMapper.toVerificationDocumentResponse(document),
      documentType: download.documentType,
      fileName: download.fileName,
      mimeType: download.mimeType,
      size: download.size,
      url: download.url,
      expiresInSeconds: download.expiresInSeconds,
    };
  }

  async deleteVerificationDocument(
    companyId: string,
    documentId: string,
    user: AuthUser,
  ): Promise<{ deleted: true }> {
    const company = await this.findCompanyOrThrow(companyId);
    this.assertCompanyOwner(company, user.id);
    const document = await this.verificationDocumentRepo.findOne({
      where: { companyId: company.id, documentId },
    });
    if (document) {
      await this.verificationDocumentRepo.softDelete(document.id);
      this.logger.log(
        `Company verification document removed companyId=${companyId} documentId=${documentId}`,
      );
    }
    return { deleted: true };
  }

  async getPostingSnapshot(companyId: string): Promise<CompanyPostingSnapshotDto> {
    return this.toPostingSnapshot(await this.findCompanyOrThrow(companyId));
  }

  async getPublicProfile(companyId: string): Promise<PublicCompanyProfileDto> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId, status: CompanyStatus.APPROVED },
    });
    if (!company) {
      throw new NotFoundException({
        code: ERROR_CODES.COMPANY.NOT_FOUND,
        message: 'Company not found or not yet approved',
      });
    }

    return this.toPublicCompanyResponse(company);
  }

  private normalizeTaxCode(value: string): string {
    return value.trim();
  }

  private async findCompanyOrThrow(companyId: string): Promise<Company> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException({
        code: ERROR_CODES.COMPANY.NOT_FOUND,
        message: `Company ${companyId} not found`,
      });
    }
    return company;
  }

  private assertCompanyOwner(company: Company, userId: string): void {
    if (company.ownerId !== userId) {
      throw new ForbiddenException({
        code: ERROR_CODES.COMMON.FORBIDDEN,
        message: 'You can only update your own company',
      });
    }
  }

  private async assertVerificationDocumentBelongsToCompany(
    companyId: string,
    documentId: string,
  ): Promise<void> {
    const document = await this.documentClientService.getDocumentMetadata(documentId);
    if (document.ownerType !== 'company' || document.ownerId !== companyId) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'Verification document must belong to this company',
      });
    }
    if (!['CERTIFICATE', 'OTHER'].includes(document.documentType)) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'Verification proof must be uploaded as CERTIFICATE or OTHER document type',
      });
    }
  }

  private toPostingSnapshot(
    company: Company,
    previousStatus?: CompanyStatus,
  ): CompanyPostingSnapshotDto {
    return {
      companyId: company.id,
      ownerUserId: company.ownerId,
      companyName: company.name,
      companyLogoUrl: company.logo,
      companyLogoDocumentId: company.logoDocumentId,
      companyStatus: company.status,
      previousCompanyStatus: previousStatus,
      companyTrustLevel: company.trustLevel,
      changedAt: company.updatedAt.toISOString(),
    };
  }

  private async publishPostingSnapshot(
    company: Company,
    previousStatus?: CompanyStatus,
  ): Promise<void> {
    const payload = this.toPostingSnapshot(company, previousStatus);
    await this.companyEventPublisher.publishPostingSnapshotChanged(payload);
  }

  private async toCompanyResponse(company: Company): Promise<CompanyResponseDto> {
    return CompanyMapper.toResponse(company, await this.resolveCompanyImageUrls(company));
  }

  private async toAdminCompanyResponse(company: Company): Promise<AdminCompanyResponseDto> {
    return CompanyMapper.toAdminResponse(company, await this.resolveCompanyImageUrls(company));
  }

  private async toPublicCompanyResponse(company: Company): Promise<PublicCompanyProfileDto> {
    return CompanyMapper.toPublicResponse(company, await this.resolveCompanyImageUrls(company));
  }

  private companyStatusCounts(
    rows: Array<{ status: CompanyStatus; count: string }>,
  ): Record<CompanyStatus, number> {
    const counts = {
      [CompanyStatus.PENDING]: 0,
      [CompanyStatus.APPROVED]: 0,
      [CompanyStatus.REJECTED]: 0,
      [CompanyStatus.SUSPENDED]: 0,
    };
    for (const row of rows) {
      counts[row.status] = Number(row.count);
    }
    return counts;
  }

  private companyTrustCounts(
    rows: Array<{ trustLevel: CompanyTrustLevel; count: string }>,
  ): Record<CompanyTrustLevel, number> {
    const counts = {
      [CompanyTrustLevel.LOW]: 0,
      [CompanyTrustLevel.MEDIUM]: 0,
      [CompanyTrustLevel.HIGH]: 0,
    };
    for (const row of rows) {
      counts[row.trustLevel] = Number(row.count);
    }
    return counts;
  }

  private async resolveCompanyImageUrls(
    company: Company,
  ): Promise<{ logoUrl: string | null; heroImageUrl: string | null }> {
    const [logoUrl, heroImageUrl] = await Promise.all([
      this.resolveDocumentUrl(company.logoDocumentId),
      this.resolveDocumentUrl(company.heroImageDocumentId),
    ]);

    return { logoUrl, heroImageUrl };
  }

  private async resolveDocumentUrl(documentId: string | null): Promise<string | null> {
    if (!documentId) {
      return null;
    }

    try {
      const download = await this.documentClientService.getDocumentDownload(documentId);
      return download.url;
    } catch (error) {
      this.logger.warn(
        `Company image URL resolve failed documentId=${documentId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private isPositiveTrustSignal(payload: JobReviewTrustSignalPayload): boolean {
    return (
      payload.decision === JobReviewDecision.APPROVE &&
      payload.riskLevel === JobModerationRiskLevel.LOW
    );
  }

  private isNegativeTrustSignal(payload: JobReviewTrustSignalPayload): boolean {
    return payload.decision === JobReviewDecision.REJECT;
  }

  private async tryRecordProcessedTrustSignal(
    payload: JobReviewTrustSignalPayload,
  ): Promise<boolean> {
    try {
      await this.processedTrustSignalRepo.insert({
        companyId: payload.companyId,
        targetType: payload.targetType,
        targetId: payload.targetId,
      });
      return true;
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }

  private increaseTrustLevel(current: CompanyTrustLevel): CompanyTrustLevel {
    if (current === CompanyTrustLevel.LOW) {
      return CompanyTrustLevel.MEDIUM;
    }
    if (current === CompanyTrustLevel.MEDIUM) {
      return CompanyTrustLevel.HIGH;
    }
    return CompanyTrustLevel.HIGH;
  }

  private decreaseTrustLevel(current: CompanyTrustLevel): CompanyTrustLevel {
    if (current === CompanyTrustLevel.HIGH) {
      return CompanyTrustLevel.MEDIUM;
    }
    if (current === CompanyTrustLevel.MEDIUM) {
      return CompanyTrustLevel.LOW;
    }
    return CompanyTrustLevel.LOW;
  }

  private async recordTrustHistoryIfChanged(input: {
    companyId: string;
    previousTrustLevel: CompanyTrustLevel;
    newTrustLevel: CompanyTrustLevel;
    source: CompanyTrustChangeSource;
    changedByUserId: string | null;
    reason: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    if (input.previousTrustLevel === input.newTrustLevel) {
      return;
    }
    await this.trustHistoryRepo.save(
      this.trustHistoryRepo.create({
        companyId: input.companyId,
        previousTrustLevel: input.previousTrustLevel,
        newTrustLevel: input.newTrustLevel,
        direction: this.resolveTrustDirection(input.previousTrustLevel, input.newTrustLevel),
        source: input.source,
        changedByUserId: input.changedByUserId,
        reason: input.reason,
        metadata: input.metadata,
      }),
    );
  }

  private resolveTrustDirection(
    previous: CompanyTrustLevel,
    next: CompanyTrustLevel,
  ): CompanyTrustChangeDirection {
    return this.trustRank(next) > this.trustRank(previous)
      ? CompanyTrustChangeDirection.INCREASE
      : CompanyTrustChangeDirection.DECREASE;
  }

  private trustRank(level: CompanyTrustLevel): number {
    if (level === CompanyTrustLevel.LOW) {
      return 1;
    }
    if (level === CompanyTrustLevel.MEDIUM) {
      return 2;
    }
    return 3;
  }

  private assertUploadedFile(
    file: CompanyUploadedFile,
    allowedMimeTypes: Set<string>,
    maxSizeBytes: number,
  ): void {
    if (!allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.UNSUPPORTED_FILE_TYPE,
        message: 'Unsupported file type',
      });
    }
    if (file.size > maxSizeBytes) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_TOO_LARGE,
        message: 'File is too large',
      });
    }
  }
}
