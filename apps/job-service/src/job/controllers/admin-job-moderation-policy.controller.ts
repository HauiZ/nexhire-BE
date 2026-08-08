import {
  Body,
  Controller,
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
  CreateJobModerationPolicyDto,
  JobModerationPolicyQueryDto,
  JobModerationPolicyResponseDto,
  TestJobModerationPolicyDto,
  UpdateJobModerationPolicyDto,
} from '../dto/job-moderation-policy.dto';
import { JobModerationPolicyService } from '../moderation/job-moderation-policy.service';

@ApiTags('admin-job-moderation-policies')
@Controller('admin/job-moderation-policies')
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminJobModerationPolicyController {
  constructor(private readonly policyService: JobModerationPolicyService) {}

  @Get()
  @ApiOperation({ summary: 'List job moderation policies' })
  @ApiSuccessResponse(JobModerationPolicyResponseDto, { isArray: true })
  @ApiErrorResponses({ statuses: [400, 401, 403, 500] })
  list(@Query() query: JobModerationPolicyQueryDto): Promise<JobModerationPolicyResponseDto[]> {
    return this.policyService.list(query);
  }

  @Get('default-rules')
  @ApiOperation({ summary: 'Get default job moderation rules for UI bootstrapping' })
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getDefaultRules() {
    return this.policyService.getDefaultRules();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one job moderation policy' })
  @ApiSuccessResponse(JobModerationPolicyResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<JobModerationPolicyResponseDto> {
    return this.policyService.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a draft job moderation policy' })
  @ApiSuccessResponse(JobModerationPolicyResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 500] })
  create(
    @CurrentUser() admin: AuthUser,
    @Body() dto: CreateJobModerationPolicyDto,
  ): Promise<JobModerationPolicyResponseDto> {
    return this.policyService.create(admin, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a draft or active job moderation policy' })
  @ApiSuccessResponse(JobModerationPolicyResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 500] })
  update(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobModerationPolicyDto,
  ): Promise<JobModerationPolicyResponseDto> {
    return this.policyService.update(admin, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish a policy and unpublish the previous active policy' })
  @ApiSuccessResponse(JobModerationPolicyResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 500] })
  publish(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JobModerationPolicyResponseDto> {
    return this.policyService.publish(admin, id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive a job moderation policy' })
  @ApiSuccessResponse(JobModerationPolicyResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  archive(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JobModerationPolicyResponseDto> {
    return this.policyService.archive(admin, id);
  }

  @Post('test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Run the active moderation policy against a sample job payload' })
  @ApiErrorResponses({ statuses: [400, 401, 403, 500] })
  test(@Body() dto: TestJobModerationPolicyDto) {
    return this.policyService.test(dto);
  }
}
