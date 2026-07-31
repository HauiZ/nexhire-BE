import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum AdminCompanyGrowthBucket {
  DAY = 'day',
  MONTH = 'month',
}

export class AdminCompanyGrowthQueryDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: AdminCompanyGrowthBucket, default: AdminCompanyGrowthBucket.DAY })
  @IsOptional()
  @IsEnum(AdminCompanyGrowthBucket)
  bucket?: AdminCompanyGrowthBucket;
}

export class AdminCompanyGrowthPointDto {
  @ApiProperty({ example: '2026-07-01' })
  bucket: string;

  @ApiProperty({ example: 4 })
  registeredCompanies: number;

  @ApiProperty({ example: 2 })
  approvedCompanies: number;

  @ApiProperty({ example: 1 })
  rejectedCompanies: number;

  @ApiProperty({ example: 0 })
  suspendedCompanies: number;

  @ApiProperty({ example: 1 })
  reviewRequestedAgain: number;
}

export class AdminCompanyGrowthDto {
  @ApiProperty({ example: '2026-07-01' })
  from: string;

  @ApiProperty({ example: '2026-07-31' })
  to: string;

  @ApiProperty({ enum: AdminCompanyGrowthBucket, example: AdminCompanyGrowthBucket.DAY })
  bucket: AdminCompanyGrowthBucket;

  @ApiProperty({ type: [AdminCompanyGrowthPointDto] })
  points: AdminCompanyGrowthPointDto[];
}
