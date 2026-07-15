import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
  AuthUser,
  CurrentUser,
  Roles,
  UserRole,
} from '@nexhire/shared';
import {
  CreateJobDto,
  CreateJobRevisionDto,
  UpdateJobDto,
  UpdateJobRevisionDto,
} from './dto/job-input.dto';
import { RecruiterJobQueryDto } from './dto/job-query.dto';
import { JobResponseDto, JobRevisionResponseDto } from './dto/job-response.dto';
import { JobService } from './job.service';

@ApiTags('recruiter-jobs')
@Controller('recruiter/jobs')
@Roles(UserRole.RECRUITER)
@ApiBearerAuth()
export class RecruiterJobController {
  constructor(private readonly jobService: JobService) {}

  @Post()
  @ApiOperation({ summary: 'Create a complete draft job' })
  @ApiSuccessResponse(JobResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500] })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateJobDto): Promise<JobResponseDto> {
    return this.jobService.createDraft(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List jobs owned by the recruiter company' })
  @ApiSuccessResponse(JobResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [400, 401, 403, 500] })
  listMine(@CurrentUser() user: AuthUser, @Query() query: RecruiterJobQueryDto) {
    return this.jobService.listMine(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one company-owned job' })
  @ApiSuccessResponse(JobResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  getMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JobResponseDto> {
    return this.jobService.getMine(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a draft job or minor fields on an eligible published job' })
  @ApiSuccessResponse(JobResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 422, 500] })
  updateMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
  ): Promise<JobResponseDto> {
    return this.jobService.updateMine(user, id, dto);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit a draft job for admin review' })
  @ApiSuccessResponse(JobResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  submitMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JobResponseDto> {
    return this.jobService.submitMine(user, id);
  }

  @Post(':jobId/revisions')
  @ApiOperation({ summary: 'Create a full-snapshot major revision draft' })
  @ApiSuccessResponse(JobRevisionResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 422, 500] })
  createRevision(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: CreateJobRevisionDto,
  ): Promise<JobRevisionResponseDto> {
    return this.jobService.createRevision(user, jobId, dto);
  }

  @Patch(':jobId/revisions/:revisionId')
  @ApiOperation({ summary: 'Update a full-snapshot major revision draft' })
  @ApiSuccessResponse(JobRevisionResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 422, 500] })
  updateRevision(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: UpdateJobRevisionDto,
  ): Promise<JobRevisionResponseDto> {
    return this.jobService.updateRevision(user, jobId, revisionId, dto);
  }

  @Post(':jobId/revisions/:revisionId/submit')
  @ApiOperation({ summary: 'Submit a major revision for manual admin review' })
  @ApiSuccessResponse(JobRevisionResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  submitRevision(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ): Promise<JobRevisionResponseDto> {
    return this.jobService.submitRevision(user, jobId, revisionId);
  }
}
