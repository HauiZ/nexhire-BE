import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import {
  JobExperienceLevel,
  JobRevisionStatus,
  JobStatus,
  JobType,
  JobWorkingType,
  PaginationQueryDto,
} from '@nexhire/shared';

export enum JobSearchSort {
  RELEVANCE = 'relevance',
  LATEST = 'latest',
  DEADLINE_ASC = 'deadline_asc',
  SALARY_DESC = 'salary_desc',
  SALARY_ASC = 'salary_asc',
}

export class PublicJobQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'backend nestjs ha noi' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ example: 'backend' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ example: 'NestJS,PostgreSQL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  skills?: string;

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

  @ApiPropertyOptional({ example: 15000000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @ApiPropertyOptional({ example: 30000000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMax?: number;

  @ApiPropertyOptional({ enum: JobSearchSort, default: JobSearchSort.RELEVANCE })
  @IsOptional()
  @IsEnum(JobSearchSort)
  sort?: JobSearchSort;
}

export class RecruiterJobQueryDto extends PublicJobQueryDto {
  @ApiPropertyOptional({ enum: JobStatus })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;
}

export class RecruiterJobRevisionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: JobRevisionStatus })
  @IsOptional()
  @IsEnum(JobRevisionStatus)
  status?: JobRevisionStatus;
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
