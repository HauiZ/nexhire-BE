import { ApiProperty } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum AdminDashboardGrowthBucket {
  DAY = 'day',
  MONTH = 'month',
}

export class AdminDashboardGrowthQueryDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: AdminDashboardGrowthBucket,
    default: AdminDashboardGrowthBucket.DAY,
  })
  @IsOptional()
  @IsEnum(AdminDashboardGrowthBucket)
  bucket?: AdminDashboardGrowthBucket;
}

export class AdminDashboardUsersDto {
  @ApiProperty({ example: 120 })
  total: number;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  byStatus: Record<string, number>;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  byRole: Record<string, number>;

  @ApiProperty({ example: 96 })
  emailVerified: number;

  @ApiProperty({ example: 24 })
  emailUnverified: number;
}

export class AdminDashboardCompaniesDto {
  @ApiProperty({ example: 24 })
  total: number;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  byStatus: Record<string, number>;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  byTrustLevel: Record<string, number>;

  @ApiProperty({ example: 2 })
  pendingReviewAgain: number;

  @ApiProperty({ example: 8 })
  rejectedBefore: number;
}

export class AdminDashboardJobsDto {
  @ApiProperty({ example: 180 })
  totalJobs: number;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  jobsByStatus: Record<string, number>;

  @ApiProperty({ example: 12 })
  jobsWaitingReview: number;

  @ApiProperty({ example: 96 })
  publishedJobs: number;

  @ApiProperty({ example: 8 })
  unpublishedJobs: number;

  @ApiProperty({ example: 20 })
  closedJobs: number;

  @ApiProperty({ example: 24 })
  totalRevisions: number;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  revisionsByStatus: Record<string, number>;

  @ApiProperty({ example: 3 })
  revisionsWaitingReview: number;
}

export class AdminDashboardOverviewDto {
  @ApiProperty({ type: AdminDashboardUsersDto })
  users: AdminDashboardUsersDto;

  @ApiProperty({ type: AdminDashboardCompaniesDto })
  companies: AdminDashboardCompaniesDto;

  @ApiProperty({ type: AdminDashboardJobsDto })
  jobs: AdminDashboardJobsDto;
}

export class AdminDashboardUserGrowthPointDto {
  @ApiProperty({ example: '2026-07-01' })
  bucket: string;

  @ApiProperty({ example: 12 })
  registeredUsers: number;

  @ApiProperty({ example: 8 })
  candidates: number;

  @ApiProperty({ example: 3 })
  recruiters: number;

  @ApiProperty({ example: 1 })
  admins: number;

  @ApiProperty({ example: 2 })
  bannedUsers: number;

  @ApiProperty({ example: 1 })
  suspendedUsers: number;

  @ApiProperty({ example: 0 })
  archivedUsers: number;
}

export class AdminDashboardCompanyGrowthPointDto {
  @ApiProperty({ example: '2026-07-01' })
  bucket: string;

  @ApiProperty({ example: 4 })
  registeredCompanies: number;

  @ApiProperty({ example: 2 })
  approvedCompanies: number;

  @ApiProperty({ example: 1 })
  rejectedCompanies: number;

  @ApiProperty({ example: 0 })
  suspendedCompanies: number;

  @ApiProperty({ example: 1 })
  reviewRequestedAgain: number;
}

export class AdminDashboardJobGrowthPointDto {
  @ApiProperty({ example: '2026-07-01' })
  bucket: string;

  @ApiProperty({ example: 8 })
  createdJobs: number;

  @ApiProperty({ example: 5 })
  publishedJobs: number;

  @ApiProperty({ example: 1 })
  unpublishedJobs: number;

  @ApiProperty({ example: 0 })
  closedJobs: number;

  @ApiProperty({ example: 4 })
  reviewedJobs: number;

  @ApiProperty({ example: 2 })
  rejectedJobs: number;

  @ApiProperty({ example: 12 })
  applicationsSubmitted: number;
}

export class AdminDashboardGrowthSeriesDto<TPoint> {
  @ApiProperty({ example: '2026-07-01' })
  from: string;

  @ApiProperty({ example: '2026-07-31' })
  to: string;

  @ApiProperty({ enum: AdminDashboardGrowthBucket, example: AdminDashboardGrowthBucket.DAY })
  bucket: AdminDashboardGrowthBucket;

  points: TPoint[];
}

export class AdminDashboardUserGrowthDto extends AdminDashboardGrowthSeriesDto<AdminDashboardUserGrowthPointDto> {
  @ApiProperty({ type: [AdminDashboardUserGrowthPointDto] })
  declare points: AdminDashboardUserGrowthPointDto[];
}

export class AdminDashboardCompanyGrowthDto extends AdminDashboardGrowthSeriesDto<AdminDashboardCompanyGrowthPointDto> {
  @ApiProperty({ type: [AdminDashboardCompanyGrowthPointDto] })
  declare points: AdminDashboardCompanyGrowthPointDto[];
}

export class AdminDashboardJobGrowthDto extends AdminDashboardGrowthSeriesDto<AdminDashboardJobGrowthPointDto> {
  @ApiProperty({ type: [AdminDashboardJobGrowthPointDto] })
  declare points: AdminDashboardJobGrowthPointDto[];
}

export class AdminDashboardGrowthDto {
  @ApiProperty({ type: AdminDashboardUserGrowthDto })
  users: AdminDashboardUserGrowthDto;

  @ApiProperty({ type: AdminDashboardCompanyGrowthDto })
  companies: AdminDashboardCompanyGrowthDto;

  @ApiProperty({ type: AdminDashboardJobGrowthDto })
  jobs: AdminDashboardJobGrowthDto;
}

export class AdminDashboardGrowthComparisonMetricDto {
  @ApiProperty({ example: 100 })
  previousValue: number;

  @ApiProperty({ example: 20 })
  change: number;

  @ApiProperty({
    example: 20,
    nullable: true,
    description: 'Percentage change from previous range. Null when previous value is zero.',
  })
  percent: number | null;
}

export class AdminDashboardUserGrowthComparisonDto {
  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  registeredUsers: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  candidates: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  recruiters: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  admins: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  bannedUsers: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  suspendedUsers: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  archivedUsers: AdminDashboardGrowthComparisonMetricDto;
}

export class AdminDashboardCompanyGrowthComparisonDto {
  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  registeredCompanies: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  approvedCompanies: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  rejectedCompanies: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  suspendedCompanies: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  reviewRequestedAgain: AdminDashboardGrowthComparisonMetricDto;
}

export class AdminDashboardJobGrowthComparisonDto {
  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  createdJobs: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  publishedJobs: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  unpublishedJobs: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  closedJobs: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  reviewedJobs: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  rejectedJobs: AdminDashboardGrowthComparisonMetricDto;

  @ApiProperty({ type: AdminDashboardGrowthComparisonMetricDto })
  applicationsSubmitted: AdminDashboardGrowthComparisonMetricDto;
}

export class AdminDashboardUserGrowthSummaryDto {
  @ApiProperty({ example: '2026-07-01' })
  from: string;

  @ApiProperty({ example: '2026-07-31' })
  to: string;

  @ApiProperty({ example: '2026-05-31' })
  comparisonFrom: string;

  @ApiProperty({ example: '2026-06-30' })
  comparisonTo: string;

  @ApiProperty({ example: 120 })
  registeredUsers: number;

  @ApiProperty({ example: 86 })
  candidates: number;

  @ApiProperty({ example: 30 })
  recruiters: number;

  @ApiProperty({ example: 4 })
  admins: number;

  @ApiProperty({ example: 2 })
  bannedUsers: number;

  @ApiProperty({ example: 5 })
  suspendedUsers: number;

  @ApiProperty({ example: 1 })
  archivedUsers: number;

  @ApiProperty({ type: AdminDashboardUserGrowthComparisonDto })
  growth: AdminDashboardUserGrowthComparisonDto;
}

export class AdminDashboardCompanyGrowthSummaryDto {
  @ApiProperty({ example: '2026-07-01' })
  from: string;

  @ApiProperty({ example: '2026-07-31' })
  to: string;

  @ApiProperty({ example: '2026-05-31' })
  comparisonFrom: string;

  @ApiProperty({ example: '2026-06-30' })
  comparisonTo: string;

  @ApiProperty({ example: 22 })
  registeredCompanies: number;

  @ApiProperty({ example: 14 })
  approvedCompanies: number;

  @ApiProperty({ example: 3 })
  rejectedCompanies: number;

  @ApiProperty({ example: 1 })
  suspendedCompanies: number;

  @ApiProperty({ example: 2 })
  reviewRequestedAgain: number;

  @ApiProperty({ type: AdminDashboardCompanyGrowthComparisonDto })
  growth: AdminDashboardCompanyGrowthComparisonDto;
}

export class AdminDashboardJobGrowthSummaryDto {
  @ApiProperty({ example: '2026-07-01' })
  from: string;

  @ApiProperty({ example: '2026-07-31' })
  to: string;

  @ApiProperty({ example: '2026-05-31' })
  comparisonFrom: string;

  @ApiProperty({ example: '2026-06-30' })
  comparisonTo: string;

  @ApiProperty({ example: 64 })
  createdJobs: number;

  @ApiProperty({ example: 41 })
  publishedJobs: number;

  @ApiProperty({ example: 8 })
  unpublishedJobs: number;

  @ApiProperty({ example: 4 })
  closedJobs: number;

  @ApiProperty({ example: 47 })
  reviewedJobs: number;

  @ApiProperty({ example: 6 })
  rejectedJobs: number;

  @ApiProperty({ example: 230 })
  applicationsSubmitted: number;

  @ApiProperty({ type: AdminDashboardJobGrowthComparisonDto })
  growth: AdminDashboardJobGrowthComparisonDto;
}
