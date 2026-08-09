import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApplicationStage, PaginationQueryDto } from '@nexhire/shared';
import { ApplicationMatchLevel } from '../entities/application.entity';

export enum RecruiterApplicationSortBy {
  SUBMITTED_AT = 'submittedAt',
  UPDATED_AT = 'updatedAt',
  MATCH_SCORE = 'matchScore',
}

export enum RecruiterCandidateSortBy {
  LAST_APPLIED_AT = 'lastAppliedAt',
  BEST_MATCH_SCORE = 'bestMatchScore',
  APPLICATION_COUNT = 'applicationCount',
  CANDIDATE_NAME = 'candidateName',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class CandidateApplicationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ApplicationStage })
  @IsOptional()
  @IsEnum(ApplicationStage)
  status?: ApplicationStage;
}

export class RecruiterApplicationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @ApiPropertyOptional({ enum: ApplicationStage })
  @IsOptional()
  @IsEnum(ApplicationStage)
  status?: ApplicationStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ApplicationMatchLevel })
  @IsOptional()
  @IsEnum(ApplicationMatchLevel)
  matchLevel?: ApplicationMatchLevel;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minMatchScore?: number;

  @ApiPropertyOptional({
    enum: RecruiterApplicationSortBy,
    default: RecruiterApplicationSortBy.SUBMITTED_AT,
  })
  @IsOptional()
  @IsEnum(RecruiterApplicationSortBy)
  sortBy: RecruiterApplicationSortBy = RecruiterApplicationSortBy.SUBMITTED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.DESC;
}

export class RecruiterCandidateQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @ApiPropertyOptional({ enum: ApplicationStage })
  @IsOptional()
  @IsEnum(ApplicationStage)
  status?: ApplicationStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ApplicationMatchLevel })
  @IsOptional()
  @IsEnum(ApplicationMatchLevel)
  matchLevel?: ApplicationMatchLevel;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minMatchScore?: number;

  @ApiPropertyOptional({
    enum: RecruiterCandidateSortBy,
    default: RecruiterCandidateSortBy.LAST_APPLIED_AT,
  })
  @IsOptional()
  @IsEnum(RecruiterCandidateSortBy)
  sortBy: RecruiterCandidateSortBy = RecruiterCandidateSortBy.LAST_APPLIED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.DESC;
}

export class RecruiterApplicationStatsQueryDto {
  @ApiPropertyOptional({ example: '2026-07-15' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-20' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
