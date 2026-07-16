import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
  AuthUser,
  CurrentUser,
  Public,
  Roles,
  UserRole,
} from '@nexhire/shared';
import { CompanyService } from './company.service';
import { CompanyResponseDto } from './dto/company-response.dto';
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
  @ApiSuccessResponse(CompanyResponseDto, { isArray: true })
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getPending(): Promise<CompanyResponseDto[]> {
    return this.companyService.getPending();
  }

  @Patch(':id/verify')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or reject a company' })
  @ApiSuccessResponse(CompanyResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500] })
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyCompanyDto,
  ): Promise<CompanyResponseDto> {
    return this.companyService.verify(id, dto.action);
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
