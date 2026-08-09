import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
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

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  policyId: string | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  policyVersion: number | null;
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

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  requirements: string | null;

  @ApiProperty({ type: [String] })
  skills: string[];

  @ApiPropertyOptional()
  benefits: string | null;

  @ApiPropertyOptional()
  categoryId: string | null;

  @ApiPropertyOptional({ enum: JobType })
  employmentType: JobType | null;

  @ApiPropertyOptional({ enum: JobWorkingType })
  workingType: JobWorkingType | null;

  @ApiPropertyOptional({ enum: JobExperienceLevel })
  experienceLevel: JobExperienceLevel | null;

  @ApiPropertyOptional()
  location: string | null;

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

export enum RecruiterJobReviewStatus {
  NOT_SUBMITTED = 'NOT_SUBMITTED',
  PENDING_ADMIN_REVIEW = 'PENDING_ADMIN_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  UNPUBLISHED = 'UNPUBLISHED',
  CLOSED = 'CLOSED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export class RecruiterJobReviewSummaryDto {
  @ApiProperty({ enum: RecruiterJobReviewStatus })
  status: RecruiterJobReviewStatus;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  reviewedAt: Date | null;

  @ApiPropertyOptional()
  reason: string | null;
}

export class RecruiterJobResponseDto extends OmitType(JobResponseDto, [
  'moderation',
  'reviewedAt',
  'reviewReason',
  'unpublishedAt',
  'unpublishReason',
] as const) {
  @ApiProperty({ type: RecruiterJobReviewSummaryDto })
  review: RecruiterJobReviewSummaryDto;
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

  @ApiPropertyOptional({ enum: JobType })
  employmentType: JobType | null;

  @ApiPropertyOptional({ enum: JobWorkingType })
  workingType: JobWorkingType | null;

  @ApiPropertyOptional({ enum: JobExperienceLevel })
  experienceLevel: JobExperienceLevel | null;

  @ApiPropertyOptional()
  location: string | null;

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

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  requirements: string | null;

  @ApiProperty({ type: [String] })
  skills: string[];

  @ApiPropertyOptional()
  benefits: string | null;

  @ApiPropertyOptional()
  categoryId: string | null;

  @ApiPropertyOptional({ enum: JobType })
  employmentType: JobType | null;

  @ApiPropertyOptional({ enum: JobWorkingType })
  workingType: JobWorkingType | null;

  @ApiPropertyOptional({ enum: JobExperienceLevel })
  experienceLevel: JobExperienceLevel | null;

  @ApiPropertyOptional()
  location: string | null;

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

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  requirements: string | null;

  @ApiProperty({ type: [String] })
  skills: string[];

  @ApiPropertyOptional()
  benefits: string | null;

  @ApiPropertyOptional({ enum: JobWorkingType })
  workingType: JobWorkingType | null;

  @ApiPropertyOptional({ enum: JobExperienceLevel })
  experienceLevel: JobExperienceLevel | null;

  @ApiPropertyOptional()
  location: string | null;

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

  @ApiPropertyOptional({ enum: JobExperienceLevel })
  experienceLevel: JobExperienceLevel | null;

  @ApiPropertyOptional()
  location: string | null;

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

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  requirements: string | null;

  @ApiProperty({ type: [String] })
  skills: string[];

  @ApiPropertyOptional()
  benefits: string | null;

  @ApiPropertyOptional()
  categoryId: string | null;

  @ApiPropertyOptional({ enum: JobType })
  employmentType: JobType | null;

  @ApiPropertyOptional({ enum: JobWorkingType })
  workingType: JobWorkingType | null;

  @ApiPropertyOptional({ enum: JobExperienceLevel })
  experienceLevel: JobExperienceLevel | null;

  @ApiPropertyOptional()
  location: string | null;

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

export class RecruiterJobRevisionResponseDto extends OmitType(JobRevisionResponseDto, [
  'moderation',
  'reviewedAt',
  'reviewReason',
] as const) {
  @ApiProperty({ type: RecruiterJobReviewSummaryDto })
  review: RecruiterJobReviewSummaryDto;
}
