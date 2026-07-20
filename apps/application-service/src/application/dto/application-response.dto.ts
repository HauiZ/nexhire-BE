import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStage } from '@nexhire/shared';
import { ApplicationMatchLevel } from '../entities/application.entity';

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

  @ApiPropertyOptional({ nullable: true })
  matchScore: number | null;

  @ApiPropertyOptional({ enum: ApplicationMatchLevel, nullable: true })
  matchLevel: ApplicationMatchLevel | null;

  @ApiProperty()
  submittedAt: Date;

  @ApiPropertyOptional({ nullable: true })
  withdrawnAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  decidedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt: Date | null;

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

export class RecruiterApplicationStatusCountsDto {
  @ApiProperty()
  SUBMITTED: number;

  @ApiProperty()
  OFFERED: number;

  @ApiProperty()
  REJECTED: number;

  @ApiProperty()
  WITHDRAWN: number;

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
  withdrawn: number;

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
