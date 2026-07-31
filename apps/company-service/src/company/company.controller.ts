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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
  AuthUser,
  CurrentUser,
  InternalServiceTokenGuard,
  Public,
  Roles,
  UserRole,
} from '@nexhire/shared';
import { CompanyService } from './company.service';
import { AdminCompanyGrowthDto, AdminCompanyGrowthQueryDto } from './dto/admin-company-growth.dto';
import { AdminCompanyOverviewDto } from './dto/admin-company-overview.dto';
import { AdminCompanyQueryDto } from './dto/admin-company-query.dto';
import { AdminCompanyResponseDto } from './dto/admin-company-response.dto';
import { CompanyAdminReasonDto, UpdateCompanyTrustLevelDto } from './dto/company-admin-action.dto';
import { CompanyPostingSnapshotDto } from './dto/company-posting-snapshot.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CompanyTrustHistoryResponseDto } from './dto/company-trust-history-response.dto';
import {
  AttachCompanyVerificationDocumentDto,
  CompanyVerificationDocumentDownloadResponseDto,
  CompanyVerificationDocumentResponseDto,
  CompanyVerificationDocumentWithMetadataResponseDto,
  DeleteCompanyVerificationDocumentResponseDto,
} from './dto/company-verification-document.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { PublicCompanyProfileDto } from './dto/public-company-profile.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { VerifyCompanyDto } from './dto/verify-company.dto';
import {
  COMPANY_HERO_IMAGE_MAX_UPLOAD_SIZE_BYTES,
  COMPANY_LOGO_MAX_UPLOAD_SIZE_BYTES,
} from '../document-client/document-upload.constants';
import { CompanyUploadedFile } from '../document-client/interfaces/company-uploaded-file.interface';

@ApiTags('companies')
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @Roles(UserRole.RECRUITER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new company profile' })
  @ApiSuccessResponse(CompanyResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 409, 422, 500] })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCompanyDto,
  ): Promise<CompanyResponseDto> {
    return this.companyService.create(user.id, dto);
  }

  @Get('me')
  @Roles(UserRole.RECRUITER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my company profile' })
  @ApiSuccessResponse(CompanyResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  findMine(@CurrentUser() user: AuthUser): Promise<CompanyResponseDto> {
    return this.companyService.findByOwner(user.id);
  }

  @Patch(':id')
  @HttpCode(200)
  @Roles(UserRole.RECRUITER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update company profile' })
  @ApiSuccessResponse(CompanyResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 422, 500] })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ): Promise<CompanyResponseDto> {
    return this.companyService.update(id, user.id, dto);
  }

  @Patch(':id/logo')
  @HttpCode(200)
  @Roles(UserRole.RECRUITER)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: COMPANY_LOGO_MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Upload and set company logo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiSuccessResponse(CompanyResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500, 503] })
  uploadLogo(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: CompanyUploadedFile,
  ): Promise<CompanyResponseDto> {
    return this.companyService.uploadLogo(id, user, file);
  }

  @Patch(':id/hero-image')
  @HttpCode(200)
  @Roles(UserRole.RECRUITER)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: COMPANY_HERO_IMAGE_MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Upload and set company hero image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiSuccessResponse(CompanyResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500, 503] })
  uploadHeroImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: CompanyUploadedFile,
  ): Promise<CompanyResponseDto> {
    return this.companyService.uploadHeroImage(id, user, file);
  }

  @Get(':id/verification-documents')
  @Roles(UserRole.RECRUITER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List company verification documents with metadata' })
  @ApiSuccessResponse(CompanyVerificationDocumentWithMetadataResponseDto, { isArray: true })
  @ApiErrorResponses({ statuses: [401, 403, 404, 500, 503] })
  listVerificationDocuments(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompanyVerificationDocumentWithMetadataResponseDto[]> {
    return this.companyService.listVerificationDocuments(id, user);
  }

  @Get(':id/verification-documents/:documentId/download-url')
  @Roles(UserRole.RECRUITER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get company verification document download URL' })
  @ApiSuccessResponse(CompanyVerificationDocumentDownloadResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500, 503] })
  getVerificationDocumentDownload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<CompanyVerificationDocumentDownloadResponseDto> {
    return this.companyService.getVerificationDocumentDownload(id, documentId, user);
  }

  @Post(':id/verification-documents')
  @Roles(UserRole.RECRUITER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Attach an uploaded document as company verification proof' })
  @ApiSuccessResponse(CompanyVerificationDocumentResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 409, 422, 500] })
  attachVerificationDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachCompanyVerificationDocumentDto,
  ): Promise<CompanyVerificationDocumentResponseDto> {
    return this.companyService.attachVerificationDocument(id, user, dto);
  }

  @Delete(':id/verification-documents/:documentId')
  @HttpCode(200)
  @Roles(UserRole.RECRUITER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a company verification document attachment' })
  @ApiSuccessResponse(DeleteCompanyVerificationDocumentResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  deleteVerificationDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<{ deleted: true }> {
    return this.companyService.deleteVerificationDocument(id, documentId, user);
  }

  @Post(':id/request-verification-review')
  @HttpCode(200)
  @Roles(UserRole.RECRUITER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request admin verification review again for a rejected company' })
  @ApiSuccessResponse(CompanyResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 409, 500] })
  requestVerificationReview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompanyResponseDto> {
    return this.companyService.requestVerificationReview(id, user);
  }

  @Get('public/:id')
  @Public()
  @ApiOperation({ summary: 'Get public company profile' })
  @ApiSuccessResponse(PublicCompanyProfileDto)
  @ApiErrorResponses({ statuses: [404, 500] })
  getPublicProfile(@Param('id', ParseUUIDPipe) id: string): Promise<PublicCompanyProfileDto> {
    return this.companyService.getPublicProfile(id);
  }
}

@ApiTags('admin-companies')
@Controller('admin/companies')
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminCompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  @ApiOperation({ summary: 'List companies for admin management' })
  @ApiSuccessResponse(AdminCompanyResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [401, 403, 422, 500] })
  listAdmin(@Query() query: AdminCompanyQueryDto) {
    return this.companyService.listAdmin(query);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Get company counts for admin dashboard overview' })
  @ApiSuccessResponse(AdminCompanyOverviewDto)
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getAdminOverview(): Promise<AdminCompanyOverviewDto> {
    return this.companyService.getAdminOverview();
  }

  @Get('growth')
  @ApiOperation({ summary: 'Get company growth chart series for admin dashboard' })
  @ApiSuccessResponse(AdminCompanyGrowthDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500] })
  getAdminGrowth(@Query() query: AdminCompanyGrowthQueryDto): Promise<AdminCompanyGrowthDto> {
    return this.companyService.getAdminGrowth(query);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Get pending companies for verification' })
  @ApiSuccessResponse(AdminCompanyResponseDto, { isArray: true })
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getPending(): Promise<AdminCompanyResponseDto[]> {
    return this.companyService.getPending();
  }

  @Get(':id/verification-documents')
  @ApiOperation({ summary: 'List company verification documents for admin review' })
  @ApiSuccessResponse(CompanyVerificationDocumentWithMetadataResponseDto, { isArray: true })
  @ApiErrorResponses({ statuses: [401, 403, 404, 500, 503] })
  listAdminVerificationDocuments(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompanyVerificationDocumentWithMetadataResponseDto[]> {
    return this.companyService.listAdminVerificationDocuments(id);
  }

  @Get(':id/verification-documents/:documentId/download-url')
  @ApiOperation({ summary: 'Get company verification document download URL for admin review' })
  @ApiSuccessResponse(CompanyVerificationDocumentDownloadResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500, 503] })
  getAdminVerificationDocumentDownload(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<CompanyVerificationDocumentDownloadResponseDto> {
    return this.companyService.getAdminVerificationDocumentDownload(id, documentId);
  }

  @Patch(':id/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve or reject a company' })
  @ApiSuccessResponse(AdminCompanyResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500] })
  verify(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyCompanyDto,
  ): Promise<AdminCompanyResponseDto> {
    return this.companyService.verify(id, dto.action, user.id, dto.reason);
  }

  @Patch(':id/suspend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Suspend a company and disable posting eligibility' })
  @ApiSuccessResponse(AdminCompanyResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 422, 500] })
  suspend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompanyAdminReasonDto,
  ): Promise<AdminCompanyResponseDto> {
    return this.companyService.suspend(id, user.id, dto.reason);
  }

  @Patch(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore a suspended/rejected company to pending review' })
  @ApiSuccessResponse(AdminCompanyResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 422, 500] })
  restore(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompanyAdminReasonDto,
  ): Promise<AdminCompanyResponseDto> {
    return this.companyService.restore(id, user.id, dto.reason);
  }

  @Patch(':id/trust-level')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update company trust level for job moderation' })
  @ApiSuccessResponse(AdminCompanyResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 422, 500] })
  updateTrustLevel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyTrustLevelDto,
  ): Promise<AdminCompanyResponseDto> {
    return this.companyService.updateTrustLevel(id, user.id, dto);
  }

  @Get(':id/trust-history')
  @ApiOperation({ summary: 'List company trust level change history' })
  @ApiSuccessResponse(CompanyTrustHistoryResponseDto, { isArray: true })
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  listTrustHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompanyTrustHistoryResponseDto[]> {
    return this.companyService.listTrustHistory(id);
  }
}

@ApiTags('internal-companies')
@Controller('internal/companies')
@UseGuards(InternalServiceTokenGuard)
export class CompanyInternalController {
  constructor(private readonly companyService: CompanyService) {}

  @Get(':id/posting-snapshot')
  @ApiOperation({ summary: 'Get company posting snapshot for service-to-service checks' })
  @ApiSuccessResponse(CompanyPostingSnapshotDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  getPostingSnapshot(@Param('id', ParseUUIDPipe) id: string): Promise<CompanyPostingSnapshotDto> {
    return this.companyService.getPostingSnapshot(id);
  }
}
