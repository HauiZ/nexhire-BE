import { ApiProperty } from '@nestjs/swagger';

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
