import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, ApiSuccessResponse, AuthUser, CurrentUser } from '@nexhire/shared';
import { RecruiterDashboardSummaryDto } from './recruiter-dashboard.dto';
import { RecruiterDashboardService } from './recruiter-dashboard.service';

@ApiTags('recruiter-dashboard')
@ApiBearerAuth()
@Controller('recruiter/dashboard')
export class RecruiterDashboardController {
  constructor(private readonly dashboardService: RecruiterDashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get recruiter dashboard summary' })
  @ApiSuccessResponse(RecruiterDashboardSummaryDto)
  @ApiErrorResponses({ statuses: [401, 403, 500, 503] })
  async getSummary(
    @CurrentUser() user?: AuthUser,
  ): Promise<{ success: true; data: RecruiterDashboardSummaryDto }> {
    return { success: true, data: await this.dashboardService.getSummary(user) };
  }
}
