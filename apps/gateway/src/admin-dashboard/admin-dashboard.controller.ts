import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, ApiSuccessResponse, AuthUser, CurrentUser } from '@nexhire/shared';
import {
  AdminDashboardCompanyGrowthSummaryDto,
  AdminDashboardGrowthDto,
  AdminDashboardGrowthQueryDto,
  AdminDashboardJobGrowthSummaryDto,
  AdminDashboardOverviewDto,
  AdminDashboardUserGrowthSummaryDto,
} from './admin-dashboard.dto';
import { AdminDashboardService } from './admin-dashboard.service';

@ApiTags('admin-dashboard')
@ApiBearerAuth()
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get admin dashboard overview' })
  @ApiSuccessResponse(AdminDashboardOverviewDto)
  @ApiErrorResponses({ statuses: [401, 403, 500, 503] })
  async getOverview(
    @CurrentUser() user?: AuthUser,
  ): Promise<{ success: true; data: AdminDashboardOverviewDto }> {
    return { success: true, data: await this.dashboardService.getOverview(user) };
  }

  @Get('growth')
  @ApiOperation({ summary: 'Get admin dashboard growth chart series' })
  @ApiSuccessResponse(AdminDashboardGrowthDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500, 503] })
  async getGrowth(
    @CurrentUser() user: AuthUser | undefined,
    @Query() query: AdminDashboardGrowthQueryDto,
  ): Promise<{ success: true; data: AdminDashboardGrowthDto }> {
    return { success: true, data: await this.dashboardService.getGrowth(user, query) };
  }

  @Get('users/growth')
  @ApiOperation({ summary: 'Get admin dashboard user growth summary for a date range' })
  @ApiSuccessResponse(AdminDashboardUserGrowthSummaryDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500, 503] })
  async getUserGrowthSummary(
    @CurrentUser() user: AuthUser | undefined,
    @Query() query: AdminDashboardGrowthQueryDto,
  ): Promise<{ success: true; data: AdminDashboardUserGrowthSummaryDto }> {
    return { success: true, data: await this.dashboardService.getUserGrowthSummary(user, query) };
  }

  @Get('companies/growth')
  @ApiOperation({ summary: 'Get admin dashboard company growth summary for a date range' })
  @ApiSuccessResponse(AdminDashboardCompanyGrowthSummaryDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500, 503] })
  async getCompanyGrowthSummary(
    @CurrentUser() user: AuthUser | undefined,
    @Query() query: AdminDashboardGrowthQueryDto,
  ): Promise<{ success: true; data: AdminDashboardCompanyGrowthSummaryDto }> {
    return {
      success: true,
      data: await this.dashboardService.getCompanyGrowthSummary(user, query),
    };
  }

  @Get('jobs/growth')
  @ApiOperation({ summary: 'Get admin dashboard job growth summary for a date range' })
  @ApiSuccessResponse(AdminDashboardJobGrowthSummaryDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500, 503] })
  async getJobGrowthSummary(
    @CurrentUser() user: AuthUser | undefined,
    @Query() query: AdminDashboardGrowthQueryDto,
  ): Promise<{ success: true; data: AdminDashboardJobGrowthSummaryDto }> {
    return { success: true, data: await this.dashboardService.getJobGrowthSummary(user, query) };
  }
}
