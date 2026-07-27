import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, ApiSuccessResponse, AuthUser, CurrentUser } from '@nexhire/shared';
import { AdminDashboardOverviewDto } from './admin-dashboard.dto';
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
}
