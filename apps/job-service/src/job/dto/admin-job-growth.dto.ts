import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum AdminJobGrowthBucket {
  DAY = 'day',
  MONTH = 'month',
}

export class AdminJobGrowthQueryDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: AdminJobGrowthBucket, default: AdminJobGrowthBucket.DAY })
  @IsOptional()
  @IsEnum(AdminJobGrowthBucket)
  bucket?: AdminJobGrowthBucket;
}

export class AdminJobGrowthPointDto {
  @ApiProperty({ example: '2026-07-01' })
  bucket: string;

  @ApiProperty({ example: 8 })
  createdJobs: number;

  @ApiProperty({ example: 5 })
  publishedJobs: number;

  @ApiProperty({ example: 1 })
  unpublishedJobs: number;

  @ApiProperty({ example: 0 })
  closedJobs: number;

  @ApiProperty({ example: 4 })
  reviewedJobs: number;

  @ApiProperty({ example: 2 })
  rejectedJobs: number;

  @ApiProperty({ example: 12 })
  applicationsSubmitted: number;
}

export class AdminJobGrowthDto {
  @ApiProperty({ example: '2026-07-01' })
  from: string;

  @ApiProperty({ example: '2026-07-31' })
  to: string;

  @ApiProperty({ enum: AdminJobGrowthBucket, example: AdminJobGrowthBucket.DAY })
  bucket: AdminJobGrowthBucket;

  @ApiProperty({ type: [AdminJobGrowthPointDto] })
  points: AdminJobGrowthPointDto[];
}
