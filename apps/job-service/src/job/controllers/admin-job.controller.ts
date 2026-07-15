import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
  AuthUser,
  CurrentUser,
  Roles,
  UserRole,
} from '@nexhire/shared';
import { AdminJobReviewQueueQueryDto } from '../dto/job-query.dto';
import { JobResponseDto, JobRevisionResponseDto } from '../dto/job-response.dto';
import { JobReasonDto, ReviewJobDto } from '../dto/job-review.dto';
import { JobService } from '../job.service';

@ApiTags('admin-jobs')
@Controller('admin/jobs')
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminJobController {
  constructor(private readonly jobService: JobService) {}

  @Get('review-queue')
  @ApiOperation({ summary: 'List jobs waiting for manual review' })
  @ApiSuccessResponse(JobResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [400, 401, 403, 500] })
  listReviewQueue(@Query() query: AdminJobReviewQueueQueryDto) {
    return this.jobService.listReviewQueue(query);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Approve or reject a job waiting for manual review' })
  @ApiSuccessResponse(JobResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  reviewJob(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewJobDto,
  ): Promise<JobResponseDto> {
    return this.jobService.reviewJob(admin, id, dto);
  }

  @Post(':id/unpublish')
  @ApiOperation({ summary: 'Admin takedown: hide a published job from public pages' })
  @ApiSuccessResponse(JobResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  unpublishByAdmin(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: JobReasonDto,
  ): Promise<JobResponseDto> {
    return this.jobService.unpublishByAdmin(admin, id, dto);
  }

  @Post(':id/republish')
  @ApiOperation({ summary: 'Admin restore: show an unpublished job publicly again' })
  @ApiSuccessResponse(JobResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  republishByAdmin(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JobResponseDto> {
    return this.jobService.republishByAdmin(admin, id);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Admin close: permanently stop recruitment for a job' })
  @ApiSuccessResponse(JobResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  closeByAdmin(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: JobReasonDto,
  ): Promise<JobResponseDto> {
    return this.jobService.closeByAdmin(admin, id, dto);
  }

  @Get('revision-review-queue')
  @ApiOperation({ summary: 'List major revisions waiting for manual review' })
  @ApiSuccessResponse(JobRevisionResponseDto, { isArray: true })
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  listRevisionReviewQueue(): Promise<JobRevisionResponseDto[]> {
    return this.jobService.listRevisionReviewQueue();
  }

  @Post('revisions/:revisionId/review')
  @ApiOperation({ summary: 'Approve or reject a major job revision' })
  @ApiSuccessResponse(JobRevisionResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  reviewRevision(
    @CurrentUser() admin: AuthUser,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: ReviewJobDto,
  ): Promise<JobRevisionResponseDto> {
    return this.jobService.reviewRevision(admin, revisionId, dto);
  }
}
