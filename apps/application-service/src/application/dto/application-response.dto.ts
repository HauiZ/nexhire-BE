import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationProgressStep, ApplicationStage } from '@nexhire/shared';
import { ApplicationMatchLevel } from '../entities/application.entity';
import { ApplicationProgressActorType } from '../entities/application-progress-event.entity';

export class ApplicationProgressEventDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ApplicationProgressStep })
  step: ApplicationProgressStep;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ enum: ApplicationProgressActorType })
  actorType: ApplicationProgressActorType;

  @ApiPropertyOptional({ nullable: true })
  actorUserId: string | null;

  @ApiPropertyOptional({ nullable: true })
  note: string | null;

  @ApiPropertyOptional({ nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiProperty()
  occurredAt: Date;

  @ApiProperty()
  isLatest: boolean;
}

export class ApplicationProgressDto {
  @ApiPropertyOptional({ enum: ApplicationProgressStep, nullable: true })
  currentProgressStep: ApplicationProgressStep | null;

  @ApiProperty({ type: [ApplicationProgressEventDto] })
  events: ApplicationProgressEventDto[];
}

export class ApplicationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  jobId: string;

  @ApiProperty()
  jobTitle: string;

  @ApiProperty()
  companyId: string;

  @ApiPropertyOptional({ nullable: true })
  companyName: string | null;

  @ApiPropertyOptional({ nullable: true })
  companyLogoUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  companyLogoDocumentId: string | null;

  @ApiProperty()
  candidateId: string;

  @ApiProperty()
  candidateUserId: string;

  @ApiPropertyOptional({ nullable: true })
  candidateFullName: string | null;

  @ApiPropertyOptional({ nullable: true })
  candidateEmail: string | null;

  @ApiPropertyOptional({ nullable: true })
  candidatePhone: string | null;

  @ApiPropertyOptional({ nullable: true })
  candidateAvatarDocumentId: string | null;

  @ApiPropertyOptional({ nullable: true })
  candidateAvatarUrl: string | null;

  @ApiProperty()
  candidateCvId: string;

  @ApiProperty()
  cvDocumentId: string;

  @ApiPropertyOptional({ nullable: true })
  cvTitle: string | null;

  @ApiProperty()
  cvFileName: string;

  @ApiProperty()
  cvMimeType: string;

  @ApiProperty()
  cvSize: number;

  @ApiProperty()
  cvParseStatus: string;

  @ApiPropertyOptional({ nullable: true })
  coverLetter: string | null;

  @ApiProperty({ enum: ApplicationStage })
  status: ApplicationStage;

  @ApiPropertyOptional({ nullable: true })
  statusNote: string | null;

  @ApiPropertyOptional({ enum: ApplicationProgressStep, nullable: true })
  currentProgressStep: ApplicationProgressStep | null;

  @ApiPropertyOptional({ type: ApplicationProgressDto, nullable: true })
  progress: ApplicationProgressDto | null;

  @ApiPropertyOptional({ nullable: true })
  matchScore: number | null;

  @ApiPropertyOptional({ enum: ApplicationMatchLevel, nullable: true })
  matchLevel: ApplicationMatchLevel | null;

  @ApiPropertyOptional({ nullable: true })
  matchRecommendation: string | null;

  @ApiPropertyOptional({ nullable: true })
  matchDecision: string | null;

  @ApiPropertyOptional({ nullable: true })
  matchPriority: string | null;

  @ApiPropertyOptional({ nullable: true })
  matchSummary: string | null;

  @ApiPropertyOptional({ type: [String], nullable: true })
  matchMatchedSkills: string[] | null;

  @ApiPropertyOptional({ type: [String], nullable: true })
  matchMissingSkills: string[] | null;

  @ApiPropertyOptional({ type: [String], nullable: true })
  matchNextActions: string[] | null;

  @ApiPropertyOptional({ type: [String], nullable: true })
  matchRiskFlags: string[] | null;

  @ApiProperty()
  submittedAt: Date;

  @ApiPropertyOptional({ nullable: true })
  decidedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  firstCvReceivedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  firstCvViewedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ApplicationCvDownloadDto {
  @ApiProperty()
  documentId: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  size: number;

  @ApiProperty()
  url: string;

  @ApiProperty()
  expiresInSeconds: number;
}

export class RecruiterCandidateSkillDto {
  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  level: string | null;

  @ApiPropertyOptional({ nullable: true })
  yearsOfExperience: number | null;
}

export class RecruiterCandidateListItemDto {
  @ApiProperty()
  candidateId: string;

  @ApiProperty()
  candidateUserId: string;

  @ApiPropertyOptional({ nullable: true })
  fullName: string | null;

  @ApiPropertyOptional({ nullable: true })
  email: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarDocumentId: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  headline: string | null;

  @ApiPropertyOptional({ nullable: true })
  location: string | null;

  @ApiProperty({ type: [RecruiterCandidateSkillDto] })
  skills: RecruiterCandidateSkillDto[];

  @ApiProperty()
  latestApplicationId: string;

  @ApiProperty()
  latestJobId: string;

  @ApiProperty()
  latestJobTitle: string;

  @ApiProperty({ enum: ApplicationStage })
  latestStatus: ApplicationStage;

  @ApiProperty()
  applicationCount: number;

  @ApiProperty()
  lastAppliedAt: Date;

  @ApiPropertyOptional({ nullable: true })
  bestMatchScore: number | null;

  @ApiPropertyOptional({ enum: ApplicationMatchLevel, nullable: true })
  bestMatchLevel: ApplicationMatchLevel | null;

  @ApiPropertyOptional({ nullable: true })
  bestMatchedApplicationId: string | null;

  @ApiPropertyOptional({ nullable: true })
  bestMatchedJobId: string | null;

  @ApiPropertyOptional({ nullable: true })
  bestMatchedJobTitle: string | null;
}

export class RecruiterCandidateDetailDto extends RecruiterCandidateListItemDto {
  @ApiProperty({ type: [ApplicationResponseDto] })
  applications: ApplicationResponseDto[];
}

export class RecruiterApplicationStatusCountsDto {
  @ApiProperty()
  SUBMITTED: number;

  @ApiProperty()
  OFFERED: number;

  @ApiProperty()
  REJECTED: number;

  @ApiProperty()
  CANCELLED: number;
}

export class RecruiterApplicationDailyStatsDto {
  @ApiProperty({ example: '2026-07-20' })
  date: string;

  @ApiProperty()
  submitted: number;

  @ApiProperty()
  offered: number;

  @ApiProperty()
  rejected: number;

  @ApiProperty()
  cancelled: number;
}

export class RecruiterApplicationStatsDto {
  @ApiProperty()
  total: number;

  @ApiProperty({ type: RecruiterApplicationStatusCountsDto })
  byStatus: RecruiterApplicationStatusCountsDto;

  @ApiProperty({ type: [RecruiterApplicationDailyStatsDto] })
  byDay: RecruiterApplicationDailyStatsDto[];

  @ApiProperty()
  responseRate: number;
}
