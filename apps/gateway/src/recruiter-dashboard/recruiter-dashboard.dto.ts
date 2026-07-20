import { ApiProperty } from '@nestjs/swagger';

export type RecruiterDashboardCompanyStatus =
  | 'NO_COMPANY'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED';

export class RecruiterDashboardCompanyDto {
  @ApiProperty({ example: '22222222-2222-2222-2222-222222222222', nullable: true })
  id: string | null;

  @ApiProperty({ enum: ['NO_COMPANY', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] })
  status: RecruiterDashboardCompanyStatus;

  @ApiProperty({ example: true })
  canPostJobs: boolean;

  @ApiProperty({ example: 80 })
  completionPercent: number;

  @ApiProperty({ example: '2026-07-16T09:00:00.000Z', nullable: true })
  submittedAt: string | null;

  @ApiProperty({ example: 'Tax code document is unreadable', nullable: true })
  rejectionReason: string | null;
}

export class RecruiterDashboardStatsDto {
  @ApiProperty({ example: 4 })
  activeJobs: number;

  @ApiProperty({ example: 2 })
  pendingJobs: number;

  @ApiProperty({ example: 12 })
  newApplications: number;

  @ApiProperty({ example: 64 })
  responseRate: number;

  @ApiProperty({ example: 6 })
  responseRateWindowDays: number;
}

export class RecruiterDashboardTasksDto {
  @ApiProperty({ example: false })
  verifyCompany: boolean;

  @ApiProperty({ example: 2 })
  pendingJobs: number;

  @ApiProperty({ example: 12 })
  submittedApplications: number;
}

export class RecruiterDashboardSummaryDto {
  @ApiProperty({ type: RecruiterDashboardCompanyDto })
  company: RecruiterDashboardCompanyDto;

  @ApiProperty({ type: RecruiterDashboardStatsDto })
  stats: RecruiterDashboardStatsDto;

  @ApiProperty({ type: RecruiterDashboardTasksDto })
  tasks: RecruiterDashboardTasksDto;
}
