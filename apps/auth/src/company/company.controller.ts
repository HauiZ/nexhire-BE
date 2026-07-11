import { Controller, Post, Body, Get, Put, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser, AuthUser, Roles, UserRole, Public } from '@nexhire/shared';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
// Thêm import CompanyResponseDto (bạn cần định nghĩa DTO này)

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  // --- Dành cho EMPLOYER (Recruiter) ---

  @Post()
  @Roles(UserRole.RECRUITER)
  @ApiOperation({ summary: 'Create a new company profile' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCompanyDto) {
    return this.companyService.create(user.id, dto);
  }

  @Get('me')
  @Roles(UserRole.RECRUITER)
  @ApiOperation({ summary: 'Get my company profile' })
  findMine(@CurrentUser() user: AuthUser) {
    return this.companyService.findByOwner(user.id);
  }

  @Put(':id')
  @Roles(UserRole.RECRUITER)
  @ApiOperation({ summary: 'Update company profile' })
  update(
    @CurrentUser() user: AuthUser, 
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() dto: UpdateCompanyDto
  ) {
    return this.companyService.update(id, user.id, dto); // Truyền user.id để check ownership
  }

  // --- Dành cho ADMIN (Verification) ---

  @Get('admin/pending')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get pending companies for verification' })
  getPending() {
    return this.companyService.getPending();
  }

  @Patch(':id/verify')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve or Reject a company' })
  verify(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body('action') action: 'APPROVE' | 'REJECT' // Nên làm 1 DTO VerifyCompanyDto cho phần này
  ) {
    return this.companyService.verify(id, action);
  }

  @Get('public/:id')
  @Public() // Cho phép ai cũng xem được
  @ApiOperation({ summary: 'Public view of company + jobs' })
  getPublicProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.companyService.getPublicProfileWithJobs(id);
  }
}