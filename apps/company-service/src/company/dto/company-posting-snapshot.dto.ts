import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyStatus, CompanyTrustLevel } from '@nexhire/shared';

export class CompanyPostingSnapshotDto {
  @ApiProperty({ format: 'uuid' })
  companyId: string;

  @ApiProperty({ format: 'uuid' })
  ownerUserId: string;

  @ApiProperty()
  companyName: string;

  @ApiPropertyOptional({ nullable: true })
  companyLogoUrl: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  companyLogoDocumentId: string | null;

  @ApiProperty({ enum: CompanyStatus })
  companyStatus: CompanyStatus;

  @ApiPropertyOptional({ enum: CompanyStatus })
  previousCompanyStatus?: CompanyStatus;

  @ApiProperty({ enum: CompanyTrustLevel })
  companyTrustLevel: CompanyTrustLevel;

  @ApiProperty({ format: 'date-time' })
  changedAt: string;
}
