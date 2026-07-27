import { ApiProperty } from '@nestjs/swagger';
import { JobRevisionStatus, JobStatus } from '@nexhire/shared';

export class AdminJobOverviewDto {
  @ApiProperty({ example: 180 })
  totalJobs: number;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  jobsByStatus: Record<JobStatus, number>;

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
  revisionsByStatus: Record<JobRevisionStatus, number>;

  @ApiProperty({ example: 3 })
  revisionsWaitingReview: number;
}
