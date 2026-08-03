import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJobGrowthDto, AdminJobGrowthQueryDto } from '../dto/admin-job-growth.dto';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
  AuthUser,
  CurrentUser,
  Roles,
  UserRole,
} from '@nexhire/shared';
import { AdminJobOverviewDto } from '../dto/admin-job-overview.dto';
import {
  AdminJobQueryDto,
  AdminJobRevisionReviewQueueQueryDto,
  AdminJobReviewQueueQueryDto,
} from '../dto/job-query.dto';
import { JobResponseDto, JobRevisionResponseDto } from '../dto/job-response.dto';
import { JobReasonDto, ReviewJobDto } from '../dto/job-review.dto';
import { JobService } from '../job.service';

@ApiTags('admin-jobs')
@Controller('admin/jobs')
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminJobController {
  constructor(private readonly jobService: JobService) {}

  @Get()
  @ApiOperation({ summary: 'List all jobs for admin management' })
  @ApiSuccessResponse(JobResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500] })
  listAdminJobs(@Query() query: AdminJobQueryDto) {
    return this.jobService.listAdminJobs(query);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Get job counts for admin dashboard overview' })
  @ApiSuccessResponse(AdminJobOverviewDto)
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getOverview(): Promise<AdminJobOverviewDto> {
    return this.jobService.getAdminOverview();
  }

  @Get('growth')
  @ApiOperation({ summary: 'Get job growth chart series for admin dashboard' })
  @ApiSuccessResponse(AdminJobGrowthDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500] })
  getGrowth(@Query() query: AdminJobGrowthQueryDto): Promise<AdminJobGrowthDto> {
    return this.jobService.getAdminGrowth(query);
  }

  @Get('review-queue')
  @ApiOperation({ summary: 'List jobs waiting for manual review' })
  @ApiSuccessResponse(JobResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [400, 401, 403, 500] })
  listReviewQueue(@Query() query: AdminJobReviewQueueQueryDto) {
    return this.jobService.listReviewQueue(query);
  }

  @Get('revisions/:revisionId')
  @ApiOperation({ summary: 'Get one job revision detail for admin review' })
  @ApiSuccessResponse(JobRevisionResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  getRevisionDetail(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ): Promise<JobRevisionResponseDto> {
    return this.jobService.getAdminRevision(revisionId);
  }

  @Get('revision-review-queue')
  @ApiOperation({ summary: 'List major revisions waiting for manual review' })
  @ApiSuccessResponse(JobRevisionResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [401, 403, 422, 500] })
  listRevisionReviewQueue(@Query() query: AdminJobRevisionReviewQueueQueryDto) {
    return this.jobService.listRevisionReviewQueue(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one job detail for admin management' })
  @ApiSuccessResponse(JobResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  getAdminJob(@Param('id', ParseUUIDPipe) id: string): Promise<JobResponseDto> {
    return this.jobService.getAdminJob(id);
  }

  @Post(':id/review')
  @HttpCode(200)
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
  @HttpCode(200)
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
  @HttpCode(200)
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
  @HttpCode(200)
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

  @Post('revisions/:revisionId/review')
  @HttpCode(200)
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
