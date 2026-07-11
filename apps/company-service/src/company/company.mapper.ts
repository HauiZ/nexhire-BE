import { Company } from './entities/company.entity';
import { CompanyResponseDto } from './dto/company-response.dto';

export class CompanyMapper {
  static toResponse(company: Company): CompanyResponseDto {
    return {
      id: company.id,
      name: company.name,
      // TypeORM có thể trả ra null cho các trường nullable, 
      // ta dùng toán tử ?? để ép về undefined cho chuẩn DTO
      logo: company.logo ?? undefined,
      description: company.description ?? undefined,
      website: company.website ?? undefined,
      address: company.address ?? undefined,
      taxCode: company.taxCode,
      ownerId: company.ownerId,
      status: company.status,
      // Đổi Date object thành ISO string để trả về JSON
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };
  }
}
