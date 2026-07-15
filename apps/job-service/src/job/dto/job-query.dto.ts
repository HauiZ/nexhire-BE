import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  JobExperienceLevel,
  JobStatus,
  JobType,
  JobWorkingType,
  PaginationQueryDto,
} from '@nexhire/shared';

export class PublicJobQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'backend' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ example: 'Ha Noi' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiPropertyOptional({ enum: JobType })
  @IsOptional()
  @IsEnum(JobType)
  employmentType?: JobType;

  @ApiPropertyOptional({ enum: JobWorkingType })
  @IsOptional()
  @IsEnum(JobWorkingType)
  workingType?: JobWorkingType;

  @ApiPropertyOptional({ enum: JobExperienceLevel })
  @IsOptional()
  @IsEnum(JobExperienceLevel)
  experienceLevel?: JobExperienceLevel;

  @ApiPropertyOptional({ example: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class RecruiterJobQueryDto extends PublicJobQueryDto {
  @ApiPropertyOptional({ enum: JobStatus })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;
}

export class AdminJobReviewQueueQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: [JobStatus.PENDING_REVIEW, JobStatus.NEEDS_REVIEW, JobStatus.SHOULD_REJECT],
  })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @IsString()
  @MaxLength(120)
  search?: string;
}
