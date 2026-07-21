import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  CandidateEmploymentType,
  CandidateProfileVisibility,
  CandidateSkillLevel,
} from '../entities/candidate.enum';

export class UpdateCandidateProfileFieldsDto {
  @ApiPropertyOptional({ example: 'Nguyen Minh Khoa' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string | null;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'khoa.nguyen@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string | null;

  @ApiPropertyOptional({ example: 'Senior Frontend Engineer' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  headline?: string | null;

  @ApiPropertyOptional({ example: 'I build performant web products.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string | null;

  @ApiPropertyOptional({ example: 'Ha Noi, Viet Nam' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @ApiPropertyOptional({ example: 'https://minhkhoa.dev' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  portfolioUrl?: string | null;

  @ApiPropertyOptional({ example: 'https://linkedin.com/in/minhkhoa' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  linkedinUrl?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  openToWork?: boolean;

  @ApiPropertyOptional({ enum: CandidateProfileVisibility })
  @IsOptional()
  @IsEnum(CandidateProfileVisibility)
  visibility?: CandidateProfileVisibility;

  @ApiPropertyOptional({ example: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5' })
  @IsOptional()
  @IsUUID()
  avatarDocumentId?: string | null;
}

export class CandidateSkillInputDto {
  @ApiProperty({ example: 'TypeScript' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ enum: CandidateSkillLevel })
  @IsOptional()
  @IsEnum(CandidateSkillLevel)
  level?: CandidateSkillLevel;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(60)
  yearsOfExperience?: number;
}

export class CandidateEducationInputDto {
  @ApiProperty({ example: 'Dai hoc Bach Khoa Ha Noi' })
  @IsString()
  @MaxLength(255)
  schoolName: string;

  @ApiPropertyOptional({ example: 'Ky su Cong nghe thong tin' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  degree?: string;

  @ApiPropertyOptional({ example: 'Cong nghe thong tin' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fieldOfStudy?: string;

  @ApiPropertyOptional({ example: 2015 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  startYear?: number;

  @ApiPropertyOptional({ example: 2019 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  endYear?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class CandidateExperienceInputDto {
  @ApiProperty({ example: 'FPT Software' })
  @IsString()
  @MaxLength(255)
  companyName: string;

  @ApiProperty({ example: 'Senior Frontend Engineer' })
  @IsString()
  @MaxLength(255)
  position: string;

  @ApiPropertyOptional({ enum: CandidateEmploymentType })
  @IsOptional()
  @IsEnum(CandidateEmploymentType)
  employmentType?: CandidateEmploymentType;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  startMonth?: number;

  @ApiPropertyOptional({ example: 2022 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  startYear?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  endMonth?: number;

  @ApiPropertyOptional({ example: 2025 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  endYear?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class CandidateCertificationInputDto {
  @ApiProperty({ example: 'AWS Certified Solutions Architect - Associate' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Amazon Web Services' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  issuer?: string;

  @ApiPropertyOptional({ example: 'https://www.credly.com/badges/example' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  credentialUrl?: string;

  @ApiPropertyOptional({ example: 2025 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  issuedYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class CandidateProjectInputDto {
  @ApiProperty({ example: 'NexHire ATS' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Built candidate profile and CV workflow.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['NestJS', 'PostgreSQL'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  technologies?: string[];

  @ApiPropertyOptional({ example: 'https://nexhire.example.com' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  projectUrl?: string;
}

export class UpdateCandidateProfileDto {
  @ApiPropertyOptional({ type: UpdateCandidateProfileFieldsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCandidateProfileFieldsDto)
  profile?: UpdateCandidateProfileFieldsDto;

  @ApiPropertyOptional({ type: [CandidateSkillInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CandidateSkillInputDto)
  skills?: CandidateSkillInputDto[];

  @ApiPropertyOptional({ type: [CandidateExperienceInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CandidateExperienceInputDto)
  experiences?: CandidateExperienceInputDto[];

  @ApiPropertyOptional({ type: [CandidateEducationInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CandidateEducationInputDto)
  educations?: CandidateEducationInputDto[];

  @ApiPropertyOptional({ type: [CandidateCertificationInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CandidateCertificationInputDto)
  certifications?: CandidateCertificationInputDto[];

  @ApiPropertyOptional({ type: [CandidateProjectInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CandidateProjectInputDto)
  projects?: CandidateProjectInputDto[];
}
