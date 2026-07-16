import { CompanyResponseDto } from './dto/company-response.dto';
import { PublicCompanyProfileDto } from './dto/public-company-profile.dto';
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
}
