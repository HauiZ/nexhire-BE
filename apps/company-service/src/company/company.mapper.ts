import { CompanyStatus } from '@nexhire/shared';
import { AdminCompanyResponseDto } from './dto/admin-company-response.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CompanyTrustHistoryResponseDto } from './dto/company-trust-history-response.dto';
import { CompanyVerificationDocumentResponseDto } from './dto/company-verification-document.dto';
import { PublicCompanyProfileDto } from './dto/public-company-profile.dto';
import { CompanyTrustHistory } from './entities/company-trust-history.entity';
import { CompanyVerificationDocument } from './entities/company-verification-document.entity';
import { Company } from './entities/company.entity';

export class CompanyMapper {
  static toResponse(
    company: Company,
    resolvedUrls: { logoUrl?: string | null; heroImageUrl?: string | null } = {},
  ): CompanyResponseDto {
    const missingRequiredFields = this.missingRequiredFields(company);
    return {
      id: company.id,
      name: company.name,
      logo: company.logo ?? undefined,
      logoUrl: resolvedUrls.logoUrl ?? company.logo ?? undefined,
      logoDocumentId: company.logoDocumentId ?? undefined,
      description: company.description ?? undefined,
      industry: company.industry ?? undefined,
      size: company.size ?? undefined,
      foundedYear: company.foundedYear ?? undefined,
      mission: company.mission ?? undefined,
      culture: company.culture ?? undefined,
      values: company.values ?? [],
      perks: company.perks ?? [],
      heroImageUrl: resolvedUrls.heroImageUrl ?? company.heroImageUrl ?? undefined,
      heroImageDocumentId: company.heroImageDocumentId ?? undefined,
      website: company.website ?? undefined,
      contactEmail: company.contactEmail ?? undefined,
      contactPhone: company.contactPhone ?? undefined,
      address: company.address ?? undefined,
      taxCode: company.taxCode,
      ownerId: company.ownerId,
      status: company.status,
      canPostJobs: company.status === CompanyStatus.APPROVED,
      completionPercent: this.completionPercent(missingRequiredFields),
      missingRequiredFields,
      submittedAt: company.createdAt.toISOString(),
      rejectionReason:
        company.status === CompanyStatus.REJECTED ? (company.statusReason ?? null) : null,
      statusReason: company.statusReason,
      statusChangedAt: company.statusChangedAt?.toISOString() ?? null,
      statusChangedByUserId: company.statusChangedByUserId,
      verificationRejectedCount: company.verificationRejectedCount,
      lastVerificationRejectedReason: company.lastVerificationRejectedReason,
      lastVerificationRejectedAt: company.lastVerificationRejectedAt?.toISOString() ?? null,
      verificationReviewRequestedAt: company.verificationReviewRequestedAt?.toISOString() ?? null,
      verificationReviewRequestedByUserId: company.verificationReviewRequestedByUserId,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };
  }

  static toAdminResponse(
    company: Company,
    resolvedUrls: { logoUrl?: string | null; heroImageUrl?: string | null } = {},
  ): AdminCompanyResponseDto {
    return {
      ...this.toResponse(company, resolvedUrls),
      trustLevel: company.trustLevel,
      approvedLowRiskCount: company.approvedLowRiskCount,
      negativeTrustSignalCount: company.negativeTrustSignalCount,
    };
  }

  static toPublicResponse(
    company: Company,
    resolvedUrls: { logoUrl?: string | null; heroImageUrl?: string | null } = {},
  ): PublicCompanyProfileDto {
    return {
      id: company.id,
      name: company.name,
      logo: company.logo ?? undefined,
      logoUrl: resolvedUrls.logoUrl ?? company.logo ?? undefined,
      logoDocumentId: company.logoDocumentId ?? undefined,
      description: company.description ?? undefined,
      industry: company.industry ?? undefined,
      size: company.size ?? undefined,
      foundedYear: company.foundedYear ?? undefined,
      mission: company.mission ?? undefined,
      culture: company.culture ?? undefined,
      values: company.values ?? [],
      perks: company.perks ?? [],
      heroImageUrl: resolvedUrls.heroImageUrl ?? company.heroImageUrl ?? undefined,
      heroImageDocumentId: company.heroImageDocumentId ?? undefined,
      website: company.website ?? undefined,
      contactEmail: company.contactEmail ?? undefined,
      contactPhone: company.contactPhone ?? undefined,
      address: company.address ?? undefined,
    };
  }

  static toTrustHistoryResponse(history: CompanyTrustHistory): CompanyTrustHistoryResponseDto {
    return {
      id: history.id,
      companyId: history.companyId,
      previousTrustLevel: history.previousTrustLevel,
      newTrustLevel: history.newTrustLevel,
      direction: history.direction,
      source: history.source,
      changedByUserId: history.changedByUserId,
      reason: history.reason,
      metadata: history.metadata,
      createdAt: history.createdAt.toISOString(),
    };
  }

  static toVerificationDocumentResponse(
    document: CompanyVerificationDocument,
  ): CompanyVerificationDocumentResponseDto {
    return {
      id: document.id,
      companyId: document.companyId,
      documentId: document.documentId,
      type: document.type,
      uploadedByUserId: document.uploadedByUserId,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  private static missingRequiredFields(company: Company): string[] {
    const fields: Array<[string, unknown]> = [
      ['name', company.name],
      ['taxCode', company.taxCode],
      ['website', company.website],
      ['address', company.address],
      ['description', company.description],
    ];
    return fields
      .filter(([, value]) => (typeof value === 'string' ? value.trim().length === 0 : !value))
      .map(([field]) => field);
  }

  private static completionPercent(missingRequiredFields: string[]): number {
    const totalRequiredFields = 5;
    return Math.round(
      ((totalRequiredFields - missingRequiredFields.length) / totalRequiredFields) * 100,
    );
  }
}
