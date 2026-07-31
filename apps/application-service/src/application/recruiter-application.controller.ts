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
import { ApplicationService } from './application.service';
import { UpdateApplicationStageDto } from './dto/application-input.dto';
import {
  RecruiterApplicationQueryDto,
  RecruiterApplicationStatsQueryDto,
} from './dto/application-query.dto';
import {
  ApplicationCvDownloadDto,
  ApplicationResponseDto,
  RecruiterApplicationStatsDto,
} from './dto/application-response.dto';
import { MatchRequestSnapshot } from './application-internal-client.service';

@ApiTags('recruiter-applications')
@Controller('recruiter/applications')
@Roles(UserRole.RECRUITER)
@ApiBearerAuth()
export class RecruiterApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

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

  @Post(':id/match')
  @ApiOperation({ summary: 'Request a fresh match score for a company-owned application' })
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
