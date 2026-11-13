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
  MatchHrReview,
} from '@nexhire/shared';
import { ApplicationService } from './application.service';
import { ReviewWorkspaceService } from './review-workspace.service';
import { SaveReviewWorkspaceDto } from './dto/review-workspace.dto';
import { UpdateApplicationStageDto } from './dto/application-input.dto';
import {
  RecruiterApplicationQueryDto,
  RecruiterApplicationStatsQueryDto,
} from './dto/application-query.dto';
import {
  ApplicationCvDownloadDto,
  ApplicationResponseDto,
  ApplicationMatchingStatusDto,
  RecruiterApplicationStatsDto,
} from './dto/application-response.dto';
import { MatchRequestSnapshot } from './application-internal-client.service';

@ApiTags('recruiter-applications')
@Controller('recruiter/applications')
@Roles(UserRole.RECRUITER)
@ApiBearerAuth()
export class RecruiterApplicationController {
  constructor(
    private readonly applicationService: ApplicationService,
    private readonly workspace: ReviewWorkspaceService,
  ) {}

  @Get(':id/review-workspace')
  @ApiOperation({
    summary: 'Read private HR notes and interview sheet bound to matching snapshots',
  })
  @ApiErrorResponses({ statuses: [401, 403, 404, 503] })
  readWorkspace(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.workspace.read(user, id);
  }

  @Post(':id/review-workspace')
  @HttpCode(200)
  @ApiOperation({ summary: 'Save HR review and interview sheet with optimistic revision checking' })
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 503] })
  saveWorkspace(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveReviewWorkspaceDto,
  ) {
    return this.workspace.save(user, id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List applications for jobs owned by the recruiter company' })
  @ApiSuccessResponse(ApplicationResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  listCompany(@CurrentUser() user: AuthUser, @Query() query: RecruiterApplicationQueryDto) {
    return this.applicationService.listCompany(user, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get recruiter application stats for dashboard charts' })
  @ApiSuccessResponse(RecruiterApplicationStatsDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 500] })
  getStats(
    @CurrentUser() user: AuthUser,
    @Query() query: RecruiterApplicationStatsQueryDto,
  ): Promise<RecruiterApplicationStatsDto> {
    return this.applicationService.getRecruiterStats(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get application detail for the recruiter company' })
  @ApiSuccessResponse(ApplicationResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404] })
  getCompanyApplication(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApplicationResponseDto> {
    return this.applicationService.getCompanyApplication(user, id);
  }

  @Get(':id/cv')
  @ApiOperation({ summary: 'Get a short-lived URL for the submitted CV' })
  @ApiSuccessResponse(ApplicationCvDownloadDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 503] })
  getCompanyCv(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApplicationCvDownloadDto> {
    return this.applicationService.getCompanyCvDownload(user, id);
  }

  @Get(':id/ai2-demo')
  @ApiOperation({ summary: 'Read opt-in experimental relative ranking score; not percent fit' })
  @ApiErrorResponses({ statuses: [401, 403, 404, 503] })
  getCompanyAi2Demo(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<import('./ai2-demo.types').Ai2DemoScore | null> {
    return this.applicationService.getCompanyApplicationAi2Demo(user, id);
  }

  @Get(':id/ai2-pool')
  @ApiOperation({
    summary: 'Compare all active applications for the owned job; all-or-none experimental order',
  })
  getCompanyAi2Pool(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.applicationService.getCompanyApplicationAi2Pool(user, id);
  }

  @Get(':id/hr-review')
  @ApiOperation({
    summary: 'Read unverified evidence proposals separately from legacy matching scores',
  })
  @ApiErrorResponses({ statuses: [401, 403, 404, 503] })
  getCompanyHrReview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MatchHrReview | null> {
    return this.applicationService.getCompanyApplicationHrReview(user, id);
  }

  @Get(':id/matching-status')
  @ApiOperation({ summary: 'Read completion identity for the latest matching request' })
  @ApiSuccessResponse(ApplicationMatchingStatusDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 503] })
  getCompanyMatchingStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApplicationMatchingStatusDto | null> {
    return this.applicationService.getCompanyApplicationMatchingStatus(user, id);
  }

  @Post(':id/match')
  @ApiOperation({ summary: 'Request fresh matching evidence for a company-owned application' })
  @ApiSuccessResponse(Object, { status: 201 })
  @ApiErrorResponses({ statuses: [401, 403, 404, 503] })
  requestMatch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MatchRequestSnapshot> {
    return this.applicationService.requestCompanyApplicationMatch(user, id);
  }

  @Patch(':id/status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark an application as offered or rejected' })
  @ApiSuccessResponse(ApplicationResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409] })
  updateStage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationStageDto,
  ): Promise<ApplicationResponseDto> {
    return this.applicationService.updateCompanyStage(user, id, dto);
  }
}
