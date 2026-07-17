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
  PublicFeaturedCompanyDto,
  PublicHomeStatsDto,
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

  @Get('companies/:companyId')
  @Public()
  @ApiOperation({ summary: 'List published jobs for a public company profile' })
  @ApiSuccessResponse(PublicJobListItemDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [400, 500] })
  listPublicByCompany(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: PublicJobQueryDto,
  ) {
    return this.jobService.listPublicByCompany(companyId, query);
  }

  @Get('featured-companies')
  @Public()
  @ApiOperation({ summary: 'List active hiring companies for the home page' })
  @ApiSuccessResponse(PublicFeaturedCompanyDto, { isArray: true })
  @ApiErrorResponses({ statuses: [400, 500] })
  listFeaturedCompanies(@Query('limit') limit?: string): Promise<PublicFeaturedCompanyDto[]> {
    return this.jobService.listFeaturedCompanies(limit);
  }

  @Get('home/stats')
  @Public()
  @ApiOperation({ summary: 'Get public home page job stats' })
  @ApiSuccessResponse(PublicHomeStatsDto)
  @ApiErrorResponses({ statuses: [500] })
  getHomeStats(): Promise<PublicHomeStatsDto> {
    return this.jobService.getHomeStats();
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
