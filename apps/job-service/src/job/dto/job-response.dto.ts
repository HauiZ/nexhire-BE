import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  JobExperienceLevel,
  JobModerationDecision,
  JobModerationRiskLevel,
  JobRevisionStatus,
  JobStatus,
  JobType,
  JobWorkingType,
} from '@nexhire/shared';

export class JobModerationSnapshotDto {
  @ApiPropertyOptional({ example: 35 })
  riskScore: number | null;

  @ApiPropertyOptional({ enum: JobModerationRiskLevel })
  riskLevel: JobModerationRiskLevel | null;

  @ApiPropertyOptional({ enum: JobModerationDecision })
  decision: JobModerationDecision | null;

  @ApiProperty({ type: [String] })
  reasons: string[];

  @ApiProperty({ type: [String] })
  matchedRules: string[];
}

export class DeleteJobResponseDto {
  @ApiProperty({ example: true })
  deleted: true;
}

export class JobResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  companyId: string;

  @ApiPropertyOptional()
  companyName: string | null;

  @ApiPropertyOptional()
  companyLogoUrl: string | null;

  @ApiPropertyOptional()
  companyLogoDocumentId: string | null;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  requirements: string;

  @ApiProperty({ type: [String] })
  skills: string[];

  @ApiPropertyOptional()
  benefits: string | null;

  @ApiPropertyOptional()
  categoryId: string | null;

  @ApiProperty({ enum: JobType })
  employmentType: JobType;

  @ApiProperty({ enum: JobWorkingType })
  workingType: JobWorkingType;

  @ApiProperty({ enum: JobExperienceLevel })
  experienceLevel: JobExperienceLevel;

  @ApiProperty()
  location: string;

  @ApiPropertyOptional()
  salaryMin: number | null;

  @ApiPropertyOptional()
  salaryMax: number | null;

  @ApiProperty()
  salaryCurrency: string;

  @ApiProperty()
  isSalaryVisible: boolean;

  @ApiPropertyOptional()
  deadline: Date | null;

  @ApiPropertyOptional()
  numberOfOpenings: number | null;

  @ApiProperty({ enum: JobStatus })
  status: JobStatus;

  @ApiProperty()
  version: number;

  @ApiProperty()
  applicationCount: number;

  @ApiPropertyOptional()
  publishedAt: Date | null;

  @ApiPropertyOptional()
  closedAt: Date | null;

  @ApiPropertyOptional()
  reviewedAt: Date | null;

  @ApiPropertyOptional()
  reviewReason: string | null;

  @ApiPropertyOptional()
  unpublishedAt: Date | null;

  @ApiPropertyOptional()
  unpublishReason: string | null;

  @ApiProperty({ type: JobModerationSnapshotDto })
  moderation: JobModerationSnapshotDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PublicJobListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  companyId: string;

  @ApiPropertyOptional()
  companyName: string | null;

  @ApiPropertyOptional()
  companyLogoUrl: string | null;

  @ApiPropertyOptional()
  companyLogoDocumentId: string | null;

  @ApiProperty({ type: [String] })
  skills: string[];

  @ApiPropertyOptional()
  categoryId: string | null;

  @ApiProperty({ enum: JobType })
  employmentType: JobType;

  @ApiProperty({ enum: JobWorkingType })
  workingType: JobWorkingType;

  @ApiProperty({ enum: JobExperienceLevel })
  experienceLevel: JobExperienceLevel;

  @ApiProperty()
  location: string;

  @ApiPropertyOptional()
  salaryMin: number | null;

  @ApiPropertyOptional()
  salaryMax: number | null;

  @ApiProperty()
  salaryCurrency: string;

  @ApiProperty()
  isSalaryVisible: boolean;

  @ApiPropertyOptional()
  deadline: Date | null;

  @ApiPropertyOptional()
  publishedAt: Date | null;
}

export class PublicFeaturedCompanyDto {
  @ApiProperty()
  companyId: string;

  @ApiPropertyOptional()
  companyName: string | null;

  @ApiPropertyOptional()
  companyLogoUrl: string | null;

  @ApiPropertyOptional()
  companyLogoDocumentId: string | null;

  @ApiProperty()
  activeJobCount: number;

  @ApiPropertyOptional()
  latestPublishedAt: Date | null;
}

export class PublicHomeStatsDto {
  @ApiProperty()
  publishedJobCount: number;

  @ApiProperty()
  activeCompanyCount: number;

  @ApiProperty()
  categoryCount: number;
}

export class RecruiterJobStatusCountsDto {
  @ApiProperty()
  DRAFT: number;

  @ApiProperty()
  PENDING_REVIEW: number;

  @ApiProperty()
  NEEDS_REVIEW: number;

  @ApiProperty()
  SHOULD_REJECT: number;

  @ApiProperty()
  PUBLISHED: number;

  @ApiProperty()
  UNPUBLISHED: number;

  @ApiProperty()
  REJECTED: number;

  @ApiProperty()
  CLOSED: number;

  @ApiProperty()
  EXPIRED: number;
}

export class PublicJobDetailDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  companyId: string;

  @ApiPropertyOptional()
  companyName: string | null;

  @ApiPropertyOptional()
  companyLogoUrl: string | null;

  @ApiPropertyOptional()
  companyLogoDocumentId: string | null;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  requirements: string;

  @ApiProperty({ type: [String] })
  skills: string[];

  @ApiPropertyOptional()
  benefits: string | null;

  @ApiPropertyOptional()
  categoryId: string | null;

  @ApiProperty({ enum: JobType })
  employmentType: JobType;

  @ApiProperty({ enum: JobWorkingType })
  workingType: JobWorkingType;

  @ApiProperty({ enum: JobExperienceLevel })
  experienceLevel: JobExperienceLevel;

  @ApiProperty()
  location: string;

  @ApiPropertyOptional()
  salaryMin: number | null;

  @ApiPropertyOptional()
  salaryMax: number | null;

  @ApiProperty()
  salaryCurrency: string;

  @ApiProperty()
  isSalaryVisible: boolean;

  @ApiPropertyOptional()
  deadline: Date | null;

  @ApiPropertyOptional()
  numberOfOpenings: number | null;

  @ApiPropertyOptional()
  publishedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class JobApplicationSnapshotDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  companyId: string;

  @ApiPropertyOptional()
  companyName: string | null;

  @ApiPropertyOptional()
  companyLogoUrl: string | null;

  @ApiPropertyOptional()
  companyLogoDocumentId: string | null;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: JobStatus })
  status: JobStatus;

  @ApiPropertyOptional()
  deadline: Date | null;

  @ApiProperty()
  isApplyable: boolean;
}

export class JobMatchingSnapshotDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  requirements: string;

  @ApiProperty({ type: [String] })
  skills: string[];

  @ApiProperty({ enum: JobWorkingType })
  workingType: JobWorkingType;

  @ApiProperty({ enum: JobExperienceLevel })
  experienceLevel: JobExperienceLevel;

  @ApiProperty()
  location: string;

  @ApiPropertyOptional()
  salaryMin: number | null;

  @ApiPropertyOptional()
  salaryMax: number | null;
}

export class JobSavedSnapshotDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  companyId: string;

  @ApiPropertyOptional()
  companyName: string | null;

  @ApiPropertyOptional()
  companyLogoUrl: string | null;

  @ApiPropertyOptional()
  companyLogoDocumentId: string | null;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: JobStatus })
  status: JobStatus;

  @ApiProperty({ enum: JobExperienceLevel })
  experienceLevel: JobExperienceLevel;

  @ApiProperty()
  location: string;

  @ApiPropertyOptional()
  salaryMin: number | null;

  @ApiPropertyOptional()
  salaryMax: number | null;

  @ApiProperty()
  salaryCurrency: string;

  @ApiProperty()
  isSalaryVisible: boolean;

  @ApiPropertyOptional()
  deadline: Date | null;

  @ApiPropertyOptional()
  publishedAt: Date | null;

  @ApiProperty()
  isPublic: boolean;
}

export class JobRevisionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  jobId: string;

  @ApiProperty({ enum: JobRevisionStatus })
  status: JobRevisionStatus;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  requirements: string;

  @ApiProperty({ type: [String] })
  skills: string[];

  @ApiPropertyOptional()
  benefits: string | null;

  @ApiPropertyOptional()
  categoryId: string | null;

  @ApiProperty({ enum: JobType })
  employmentType: JobType;

  @ApiProperty({ enum: JobWorkingType })
  workingType: JobWorkingType;

  @ApiProperty({ enum: JobExperienceLevel })
  experienceLevel: JobExperienceLevel;

  @ApiProperty()
  location: string;

  @ApiPropertyOptional()
  salaryMin: number | null;

  @ApiPropertyOptional()
  salaryMax: number | null;

  @ApiProperty()
  salaryCurrency: string;

  @ApiProperty()
  isSalaryVisible: boolean;

  @ApiPropertyOptional()
  deadline: Date | null;

  @ApiPropertyOptional()
  numberOfOpenings: number | null;

  @ApiPropertyOptional()
  changeSummary: string | null;

  @ApiProperty({ type: JobModerationSnapshotDto })
  moderation: JobModerationSnapshotDto;

  @ApiPropertyOptional()
  reviewedAt: Date | null;

  @ApiPropertyOptional()
  reviewReason: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
