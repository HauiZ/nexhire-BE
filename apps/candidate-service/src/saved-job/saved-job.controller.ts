import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
  AuthUser,
  CurrentUser,
  PaginationQueryDto,
  Roles,
  UserRole,
} from '@nexhire/shared';
import {
  SavedJobBatchStatusResponseDto,
  DeleteSavedJobResponseDto,
  SavedJobResponseDto,
  SavedJobStatusResponseDto,
} from './dto/saved-job-response.dto';
import { SavedJobBatchStatusQueryDto } from './dto/saved-job-query.dto';
import { SavedJobService } from './saved-job.service';

@ApiTags('saved-jobs')
@Controller('saved-jobs')
@Roles(UserRole.CANDIDATE)
@ApiBearerAuth()
export class SavedJobController {
  constructor(private readonly savedJobService: SavedJobService) {}

  @Get()
  @ApiOperation({ summary: 'List jobs saved by the current candidate' })
  @ApiSuccessResponse(SavedJobResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  listMine(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.savedJobService.listMine(user, query);
  }

  @Post(':jobId')
  @ApiOperation({ summary: 'Save a published job for the current candidate' })
  @ApiSuccessResponse(SavedJobResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [401, 403, 404, 409, 503] })
  saveMine(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<SavedJobResponseDto> {
    return this.savedJobService.saveMine(user, jobId);
  }

  @Get('status')
  @ApiOperation({ summary: 'Batch-check which jobs are saved by the current candidate' })
  @ApiSuccessResponse(SavedJobBatchStatusResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 500] })
  getMineBatchStatus(
    @CurrentUser() user: AuthUser,
    @Query() query: SavedJobBatchStatusQueryDto,
  ): Promise<SavedJobBatchStatusResponseDto> {
    return this.savedJobService.getMineBatchStatus(user, query.jobIds);
  }

  @Delete(':jobId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a saved job for the current candidate' })
  @ApiSuccessResponse(DeleteSavedJobResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  unsaveMine(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<DeleteSavedJobResponseDto> {
    return this.savedJobService.unsaveMine(user, jobId);
  }

  @Get(':jobId/status')
  @ApiOperation({ summary: 'Check whether the current candidate saved a job' })
  @ApiSuccessResponse(SavedJobStatusResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getMineStatus(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<SavedJobStatusResponseDto> {
    return this.savedJobService.getMineStatus(user, jobId);
  }
}
