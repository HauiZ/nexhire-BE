import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum AdminGrowthBucket {
  DAY = 'day',
  MONTH = 'month',
}

export class AdminUserGrowthQueryDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: AdminGrowthBucket, default: AdminGrowthBucket.DAY })
  @IsOptional()
  @IsEnum(AdminGrowthBucket)
  bucket?: AdminGrowthBucket;
}

export class AdminUserGrowthPointDto {
  @ApiProperty({ example: '2026-07-01' })
  bucket: string;

  @ApiProperty({ example: 12 })
  registeredUsers: number;

  @ApiProperty({ example: 8 })
  candidates: number;

  @ApiProperty({ example: 3 })
  recruiters: number;

  @ApiProperty({ example: 1 })
  admins: number;

  @ApiProperty({ example: 2 })
  bannedUsers: number;

  @ApiProperty({ example: 1 })
  suspendedUsers: number;

  @ApiProperty({ example: 0 })
  archivedUsers: number;
}

export class AdminUserGrowthDto {
  @ApiProperty({ example: '2026-07-01' })
  from: string;

  @ApiProperty({ example: '2026-07-31' })
  to: string;

  @ApiProperty({ enum: AdminGrowthBucket, example: AdminGrowthBucket.DAY })
  bucket: AdminGrowthBucket;

  @ApiProperty({ type: [AdminUserGrowthPointDto] })
  points: AdminUserGrowthPointDto[];
}
