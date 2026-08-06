import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsArray,
  ArrayMaxSize,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { JobExperienceLevel, JobType, JobWorkingType } from '@nexhire/shared';

export class JobInputDto {
  @ApiPropertyOptional({ example: 'Backend Developer' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ example: 'Develop and maintain REST APIs for NexHire.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(12000)
  description?: string;

  @ApiPropertyOptional({ example: 'At least 1 year experience with Node.js and PostgreSQL.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  requirements?: string;

  @ApiPropertyOptional({ type: [String], example: ['NestJS', 'PostgreSQL', 'RabbitMQ'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  skills?: string[];

  @ApiPropertyOptional({ example: '13th salary, insurance, hybrid work.' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  benefits?: string;

  @ApiPropertyOptional({ example: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

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

  @ApiPropertyOptional({ example: 'Ha Noi, Viet Nam' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({ example: 15000000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @ApiPropertyOptional({ example: 25000000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMax?: number;

  @ApiPropertyOptional({ example: 'VND', default: 'VND' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  salaryCurrency?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isSalaryVisible?: boolean;

  @ApiPropertyOptional({ example: '2026-09-30T17:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline?: Date;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  numberOfOpenings?: number;
}

export class CreateJobDto extends JobInputDto {
  @ApiProperty({ example: 'Backend Developer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;
}

export class UpdateJobDto extends JobInputDto {}

export class CreateJobRevisionDto extends JobInputDto {
  @ApiPropertyOptional({ example: 'Update salary range and clarify responsibilities.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeSummary?: string;
}

export class UpdateJobRevisionDto extends CreateJobRevisionDto {}
