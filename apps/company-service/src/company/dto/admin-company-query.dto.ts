import { ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyStatus, CompanyTrustLevel, PaginationQueryDto } from '@nexhire/shared';
import { IsBooleanString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum AdminCompanySort {
  LATEST = 'latest',
  OLDEST = 'oldest',
  REJECTED_COUNT_DESC = 'rejected_count_desc',
}

export class AdminCompanyQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CompanyStatus })
  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @ApiPropertyOptional({ enum: CompanyTrustLevel })
  @IsOptional()
  @IsEnum(CompanyTrustLevel)
  trustLevel?: CompanyTrustLevel;

  @ApiPropertyOptional({ example: 'nexhire' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ example: 'true' })
  @IsOptional()
  @IsBooleanString()
  hasRejectedBefore?: string;

  @ApiPropertyOptional({ enum: AdminCompanySort, default: AdminCompanySort.LATEST })
  @IsOptional()
  @IsEnum(AdminCompanySort)
  sort?: AdminCompanySort;
}
