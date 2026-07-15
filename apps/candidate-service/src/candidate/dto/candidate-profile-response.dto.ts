import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  CandidateDataSource,
  CandidateEmploymentType,
  CandidateProfileVisibility,
  CandidateSkillLevel,
} from '../entities/candidate.enum';
import { CandidateCvResponseDto } from '../../cv/dto/cv-response.dto';

export class CandidateProfileFieldsResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiPropertyOptional()
  fullName: string | null;

  @ApiPropertyOptional()
  phone: string | null;

  @ApiPropertyOptional()
  contactEmail: string | null;

  @ApiPropertyOptional()
  avatarDocumentId: string | null;

  @ApiPropertyOptional()
  headline: string | null;

  @ApiPropertyOptional()
  summary: string | null;

  @ApiPropertyOptional()
  location: string | null;

  @ApiPropertyOptional()
  portfolioUrl: string | null;

  @ApiPropertyOptional()
  linkedinUrl: string | null;

  @ApiProperty()
  openToWork: boolean;

  @ApiProperty({ enum: CandidateProfileVisibility })
  visibility: CandidateProfileVisibility;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class CandidateSkillResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ enum: CandidateSkillLevel })
  level: CandidateSkillLevel | null;

  @ApiPropertyOptional()
  yearsOfExperience: number | null;

  @ApiProperty({ enum: CandidateDataSource })
  source: CandidateDataSource;
}

export class CandidateExperienceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  companyName: string;

  @ApiProperty()
  position: string;

  @ApiPropertyOptional({ enum: CandidateEmploymentType })
  employmentType: CandidateEmploymentType | null;

  @ApiPropertyOptional()
  startMonth: number | null;

  @ApiPropertyOptional()
  startYear: number | null;

  @ApiPropertyOptional()
  endMonth: number | null;

  @ApiPropertyOptional()
  endYear: number | null;

  @ApiProperty()
  isCurrent: boolean;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ enum: CandidateDataSource })
  source: CandidateDataSource;
}

export class CandidateEducationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  schoolName: string;

  @ApiPropertyOptional()
  degree: string | null;

  @ApiPropertyOptional()
  fieldOfStudy: string | null;

  @ApiPropertyOptional()
  startYear: number | null;

  @ApiPropertyOptional()
  endYear: number | null;

  @ApiProperty()
  isCurrent: boolean;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ enum: CandidateDataSource })
  source: CandidateDataSource;
}

export class CandidateCertificationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  issuer: string | null;

  @ApiPropertyOptional()
  credentialUrl: string | null;

  @ApiPropertyOptional()
  issuedYear: number | null;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ enum: CandidateDataSource })
  source: CandidateDataSource;
}

export class CandidateProjectResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ type: [String] })
  technologies: string[];

  @ApiPropertyOptional()
  projectUrl: string | null;

  @ApiProperty({ enum: CandidateDataSource })
  source: CandidateDataSource;
}

export class CandidateProfileResponseDto {
  @ApiProperty({ type: CandidateProfileFieldsResponseDto })
  profile: CandidateProfileFieldsResponseDto;

  @ApiProperty({ type: [CandidateSkillResponseDto] })
  skills: CandidateSkillResponseDto[];

  @ApiProperty({ type: [CandidateExperienceResponseDto] })
  experiences: CandidateExperienceResponseDto[];

  @ApiProperty({ type: [CandidateEducationResponseDto] })
  educations: CandidateEducationResponseDto[];

  @ApiProperty({ type: [CandidateCertificationResponseDto] })
  certifications: CandidateCertificationResponseDto[];

  @ApiProperty({ type: [CandidateProjectResponseDto] })
  projects: CandidateProjectResponseDto[];

  @ApiProperty({ type: CandidateCvResponseDto, nullable: true })
  defaultCv: CandidateCvResponseDto | null;

  @ApiProperty({ type: [CandidateCvResponseDto] })
  cvs: CandidateCvResponseDto[];

  @ApiProperty({ example: 70 })
  completionPercent: number;
}
