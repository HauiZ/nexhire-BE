import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
  InternalServiceTokenGuard,
  Public,
} from '@nexhire/shared';
import { PublicJobQueryDto } from '../dto/job-query.dto';
import {
  JobApplicationSnapshotDto,
  JobSavedSnapshotDto,
  PublicJobDetailDto,
  PublicJobListItemDto,
} from '../dto/job-response.dto';
import { JobService } from '../job.service';

@ApiTags('jobs')
@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List published jobs for guests and candidates' })
  @ApiSuccessResponse(PublicJobListItemDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [400, 500] })
  listPublic(@Query() query: PublicJobQueryDto) {
    return this.jobService.listPublic(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a published job detail' })
  @ApiSuccessResponse(PublicJobDetailDto)
  @ApiErrorResponses({ statuses: [404, 500] })
  getPublic(@Param('id', ParseUUIDPipe) id: string): Promise<PublicJobDetailDto> {
    return this.jobService.getPublic(id);
  }
}

@ApiTags('internal-jobs')
@Controller('internal/jobs')
@UseGuards(InternalServiceTokenGuard)
export class JobInternalController {
  constructor(private readonly jobService: JobService) {}

  @Get(':id/application-snapshot')
  @ApiOperation({ summary: 'Get job snapshot for a candidate application' })
  @ApiSuccessResponse(JobApplicationSnapshotDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  getApplicationSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JobApplicationSnapshotDto> {
    return this.jobService.getApplicationSnapshot(id);
  }

  @Get(':id/saved-snapshot')
  @ApiOperation({ summary: 'Get job snapshot for candidate saved jobs' })
  @ApiSuccessResponse(JobSavedSnapshotDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  getSavedSnapshot(@Param('id', ParseUUIDPipe) id: string): Promise<JobSavedSnapshotDto> {
    return this.jobService.getSavedSnapshot(id);
  }
}
