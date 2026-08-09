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
import { UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
  AuthUser,
  CurrentUser,
  InternalServiceTokenGuard,
  Roles,
  UserRole,
} from '@nexhire/shared';
import { ApplicationService } from './application.service';
import {
  CreateApplicationDto,
  UpdateApplicationMatchSnapshotDto,
} from './dto/application-input.dto';
import { CandidateApplicationQueryDto } from './dto/application-query.dto';
import { ApplicationCvDownloadDto, ApplicationResponseDto } from './dto/application-response.dto';
import { CvDocumentRetentionResponseDto } from './dto/cv-document-retention.dto';

@ApiTags('applications')
@Controller('applications')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Post()
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply to a published job using an existing candidate CV' })
  @ApiSuccessResponse(ApplicationResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 503] })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.applicationService.create(user, dto);
  }

  @Get('me')
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List current candidate applications' })
  @ApiSuccessResponse(ApplicationResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  listMine(@CurrentUser() user: AuthUser, @Query() query: CandidateApplicationQueryDto) {
    return this.applicationService.listMine(user, query);
  }

  @Get('me/:id')
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current candidate application detail' })
  @ApiSuccessResponse(ApplicationResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404] })
  getMine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApplicationResponseDto> {
    return this.applicationService.getMine(user, id);
  }

  @Get('me/:id/cv')
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a short-lived URL for the CV used in this application' })
  @ApiSuccessResponse(ApplicationCvDownloadDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 503] })
  getMineCv(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApplicationCvDownloadDto> {
    return this.applicationService.getMineCvDownload(user, id);
  }
}

@ApiTags('internal-applications')
@Controller('internal/applications')
@UseGuards(InternalServiceTokenGuard)
export class ApplicationInternalController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Get('cv-documents/:documentId/retention')
  @ApiOperation({ summary: 'Check whether a CV document can be physically deleted' })
  @ApiSuccessResponse(CvDocumentRetentionResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getCvDocumentRetention(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query('terminalBefore') terminalBefore?: string,
  ): Promise<CvDocumentRetentionResponseDto> {
    return this.applicationService.getCvDocumentRetention(documentId, terminalBefore);
  }

  @Patch(':id/match-snapshot')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update application match score snapshot' })
  @ApiSuccessResponse(ApplicationResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 422, 500] })
  updateMatchSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationMatchSnapshotDto,
  ): Promise<ApplicationResponseDto> {
    return this.applicationService.updateMatchSnapshot(id, dto);
  }
}
