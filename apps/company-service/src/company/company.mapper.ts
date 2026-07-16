import { AdminCompanyResponseDto } from './dto/admin-company-response.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CompanyTrustHistoryResponseDto } from './dto/company-trust-history-response.dto';
import { PublicCompanyProfileDto } from './dto/public-company-profile.dto';
import { CompanyTrustHistory } from './entities/company-trust-history.entity';
import { Company } from './entities/company.entity';

export class CompanyMapper {
  static toResponse(company: Company): CompanyResponseDto {
    return {
      id: company.id,
      name: company.name,
      logo: company.logo ?? undefined,
      description: company.description ?? undefined,
      website: company.website ?? undefined,
      address: company.address ?? undefined,
      taxCode: company.taxCode,
      ownerId: company.ownerId,
      status: company.status,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };
  }

  static toAdminResponse(company: Company): AdminCompanyResponseDto {
    return {
      ...this.toResponse(company),
      trustLevel: company.trustLevel,
      approvedLowRiskCount: company.approvedLowRiskCount,
      negativeTrustSignalCount: company.negativeTrustSignalCount,
    };
  }

  static toPublicResponse(company: Company): PublicCompanyProfileDto {
    return {
      id: company.id,
      name: company.name,
      logo: company.logo ?? undefined,
      description: company.description ?? undefined,
      website: company.website ?? undefined,
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
}
