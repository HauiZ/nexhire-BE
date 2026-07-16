import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { AdminCompanyResponseDto } from './dto/admin-company-response.dto';
import { CompanyAdminReasonDto, UpdateCompanyTrustLevelDto } from './dto/company-admin-action.dto';
import { CompanyPostingSnapshotDto } from './dto/company-posting-snapshot.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CompanyTrustHistoryResponseDto } from './dto/company-trust-history-response.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { PublicCompanyProfileDto } from './dto/public-company-profile.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { VerifyCompanyDto } from './dto/verify-company.dto';

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

  @Put(':id')
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

  @Get('admin/pending')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pending companies for verification' })
  @ApiSuccessResponse(AdminCompanyResponseDto, { isArray: true })
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getPending(): Promise<AdminCompanyResponseDto[]> {
    return this.companyService.getPending();
  }

  @Patch(':id/verify')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or reject a company' })
  @ApiSuccessResponse(AdminCompanyResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500] })
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyCompanyDto,
  ): Promise<AdminCompanyResponseDto> {
    return this.companyService.verify(id, dto.action);
  }

  @Patch('admin/:id/suspend')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend a company and disable posting eligibility' })
  @ApiSuccessResponse(AdminCompanyResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 422, 500] })
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: CompanyAdminReasonDto,
  ): Promise<AdminCompanyResponseDto> {
    return this.companyService.suspend(id);
  }

  @Patch('admin/:id/restore')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restore a suspended/rejected company to pending review' })
  @ApiSuccessResponse(AdminCompanyResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 422, 500] })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: CompanyAdminReasonDto,
  ): Promise<AdminCompanyResponseDto> {
    return this.companyService.restore(id);
  }

  @Patch('admin/:id/trust-level')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
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

  @Get('admin/:id/trust-history')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List company trust level change history' })
  @ApiSuccessResponse(CompanyTrustHistoryResponseDto, { isArray: true })
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  listTrustHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompanyTrustHistoryResponseDto[]> {
    return this.companyService.listTrustHistory(id);
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
