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
} from '@nexhire/shared';
import { Repository } from 'typeorm';
import { CompanyMapper } from './company.mapper';
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
    return CompanyMapper.toResponse(saved);
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
    return CompanyMapper.toResponse(saved);
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
    return CompanyMapper.toResponse(saved);
  }

  async findByOwner(userId: string): Promise<CompanyResponseDto> {
    const company = await this.companyRepo.findOne({ where: { ownerId: userId } });
    if (!company) {
      throw new NotFoundException({
        code: ERROR_CODES.COMPANY.NOT_FOUND,
        message: 'Company profile not found',
      });
    }
    return CompanyMapper.toResponse(company);
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
    return CompanyMapper.toResponse(saved);
  }

  async getPending(): Promise<AdminCompanyResponseDto[]> {
    const companies = await this.companyRepo.find({
      where: { status: CompanyStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    return companies.map(CompanyMapper.toAdminResponse);
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
    if (action === VerifyAction.APPROVE) {
      company.status = CompanyStatus.APPROVED;
      company.statusReason = null;
    } else if (action === VerifyAction.REJECT) {
      if (!statusReason) {
        throw new BadRequestException({
          code: ERROR_CODES.COMPANY.INVALID_VERIFY_ACTION,
          message: 'Rejecting a company requires a reason',
        });
      }
      company.status = CompanyStatus.REJECTED;
      company.statusReason = statusReason;
    } else {
      throw new BadRequestException({
        code: ERROR_CODES.COMPANY.INVALID_VERIFY_ACTION,
        message: 'Invalid verify action',
      });
    }
    company.statusChangedAt = new Date();
    company.statusChangedByUserId = adminUserId ?? null;

    const saved = await this.companyRepo.save(company);
    await this.publishPostingSnapshot(saved, previousStatus);
    this.logger.log(`Company verified companyId=${companyId} action=${action}`);
    return CompanyMapper.toAdminResponse(saved);
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
    return CompanyMapper.toAdminResponse(saved);
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
    return CompanyMapper.toAdminResponse(saved);
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
    return CompanyMapper.toAdminResponse(saved);
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
  ): Promise<CompanyVerificationDocumentResponseDto[]> {
    const company = await this.findCompanyOrThrow(companyId);
    this.assertCompanyOwner(company, user.id);
    const documents = await this.verificationDocumentRepo.find({
      where: { companyId: company.id },
      order: { createdAt: 'DESC' },
    });
    return documents.map(CompanyMapper.toVerificationDocumentResponse);
  }

  async listAdminVerificationDocuments(
    companyId: string,
  ): Promise<CompanyVerificationDocumentWithMetadataResponseDto[]> {
    await this.findCompanyOrThrow(companyId);
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

    return CompanyMapper.toPublicResponse(company);
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
