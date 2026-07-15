import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, ApiSuccessResponse, Public } from '@nexhire/shared';
import { PublicJobQueryDto } from './dto/job-query.dto';
import { JobResponseDto, PublicJobListItemDto } from './dto/job-response.dto';
import { JobService } from './job.service';

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
  @ApiSuccessResponse(JobResponseDto)
  @ApiErrorResponses({ statuses: [404, 500] })
  getPublic(@Param('id', ParseUUIDPipe) id: string): Promise<JobResponseDto> {
    return this.jobService.getPublic(id);
  }
}
