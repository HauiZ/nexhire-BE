import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
} from '../dto/job-input.dto';
import { RecruiterJobQueryDto, RecruiterJobRevisionQueryDto } from '../dto/job-query.dto';
import {
  DeleteJobResponseDto,
  RecruiterJobResponseDto,
  RecruiterJobRevisionResponseDto,
  RecruiterJobStatusCountsDto,
} from '../dto/job-response.dto';
import { JobReasonDto } from '../dto/job-review.dto';
import { JobService } from '../job.service';

@ApiTags('recruiter-jobs')
@Controller('recruiter/jobs')
@Roles(UserRole.RECRUITER)
@ApiBearerAuth()
export class RecruiterJobController {
  constructor(private readonly jobService: JobService) {}

  @Post()
  @ApiOperation({ summary: 'Create a complete draft job' })
  @ApiSuccessResponse(RecruiterJobResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500] })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateJobDto,
  ): Promise<RecruiterJobResponseDto> {
    return this.jobService.createDraft(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List jobs owned by the recruiter company' })
  @ApiSuccessResponse(RecruiterJobResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [400, 401, 403, 500] })
  listMine(@CurrentUser() user: AuthUser, @Query() query: RecruiterJobQueryDto) {
    return this.jobService.listMine(user, query);
  }

  @Get('status-counts')
  @ApiOperation({ summary: 'Count company-owned jobs by status' })
  @ApiSuccessResponse(RecruiterJobStatusCountsDto)
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getStatusCounts(@CurrentUser() user: AuthUser): Promise<RecruiterJobStatusCountsDto> {
    return this.jobService.getCompanyStatusCounts(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one company-owned job' })
  @ApiSuccessResponse(RecruiterJobResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  getMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecruiterJobResponseDto> {
    return this.jobService.getMine(user, id);
  }

  @Patch(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update a draft job or minor fields on an eligible published job' })
  @ApiSuccessResponse(RecruiterJobResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 422, 500] })
  updateMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
  ): Promise<RecruiterJobResponseDto> {
    return this.jobService.updateMine(user, id, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit a draft job for admin review' })
  @ApiSuccessResponse(RecruiterJobResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  submitMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecruiterJobResponseDto> {
    return this.jobService.submitMine(user, id);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Soft delete an eligible company-owned job' })
  @ApiSuccessResponse(DeleteJobResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 409, 500] })
  deleteMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ deleted: true }> {
    return this.jobService.deleteMine(user, id);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hide a published job from the public page' })
  @ApiSuccessResponse(RecruiterJobResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  unpublishMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: JobReasonDto,
  ): Promise<RecruiterJobResponseDto> {
    return this.jobService.unpublishMine(user, id, dto);
  }

  @Post(':id/republish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Show an unpublished job on the public page again' })
  @ApiSuccessResponse(RecruiterJobResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  republishMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecruiterJobResponseDto> {
    return this.jobService.republishMine(user, id);
  }

  @Post(':id/close')
  @HttpCode(200)
  @ApiOperation({ summary: 'Permanently close a job and cancel pending applications' })
  @ApiSuccessResponse(RecruiterJobResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  closeMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: JobReasonDto,
  ): Promise<RecruiterJobResponseDto> {
    return this.jobService.closeMine(user, id, dto);
  }

  @Post(':jobId/revisions')
  @ApiOperation({ summary: 'Create a full-snapshot major revision draft' })
  @ApiSuccessResponse(RecruiterJobRevisionResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 422, 500] })
  createRevision(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: CreateJobRevisionDto,
  ): Promise<RecruiterJobRevisionResponseDto> {
    return this.jobService.createRevision(user, jobId, dto);
  }

  @Get(':jobId/revisions')
  @ApiOperation({ summary: 'List major revisions for a company-owned job' })
  @ApiSuccessResponse(RecruiterJobRevisionResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 500] })
  listRevisions(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() query: RecruiterJobRevisionQueryDto,
  ) {
    return this.jobService.listRevisions(user, jobId, query);
  }

  @Get(':jobId/revisions/:revisionId')
  @ApiOperation({ summary: 'Get one major revision for a company-owned job' })
  @ApiSuccessResponse(RecruiterJobRevisionResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  getRevision(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ): Promise<RecruiterJobRevisionResponseDto> {
    return this.jobService.getRevision(user, jobId, revisionId);
  }

  @Patch(':jobId/revisions/:revisionId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update a full-snapshot major revision draft' })
  @ApiSuccessResponse(RecruiterJobRevisionResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 422, 500] })
  updateRevision(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: UpdateJobRevisionDto,
  ): Promise<RecruiterJobRevisionResponseDto> {
    return this.jobService.updateRevision(user, jobId, revisionId, dto);
  }

  @Post(':jobId/revisions/:revisionId/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit a major revision for manual admin review' })
  @ApiSuccessResponse(RecruiterJobRevisionResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  submitRevision(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ): Promise<RecruiterJobRevisionResponseDto> {
    return this.jobService.submitRevision(user, jobId, revisionId);
  }
}
