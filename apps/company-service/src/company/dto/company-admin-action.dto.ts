import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CompanyTrustLevel } from '@nexhire/shared';

export class CompanyAdminReasonDto {
  @ApiPropertyOptional({ example: 'Business license verification failed' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateCompanyTrustLevelDto {
  @ApiProperty({ enum: CompanyTrustLevel, example: CompanyTrustLevel.HIGH })
  @IsEnum(CompanyTrustLevel)
  trustLevel: CompanyTrustLevel;

  @ApiProperty({ example: 'Company has consistently submitted verified low-risk jobs' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
