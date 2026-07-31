import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ApiErrorResponses,
  ApiSuccessResponse,
  AuthUser,
  CurrentUser,
  Roles,
  UserRole,
} from '@nexhire/shared';

import { AiManagementService } from './ai-management.service';
import { AiConfigResponseDto } from './dto/ai-config-response.dto';
import { UpdateAiConfigDto } from './dto/update-ai-config.dto';

@ApiTags('admin-ai-configs')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/ai-configs')
export class AiManagementController {
  constructor(private readonly aiManagementService: AiManagementService) {}

  @Get()
  @ApiOperation({ summary: 'Get current AI parsing config and supported models' })
  @ApiSuccessResponse(AiConfigResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getConfig(): Promise<AiConfigResponseDto> {
    return this.aiManagementService.getConfig();
  }

  @Get('usage-summary')
  @ApiOperation({ summary: 'Get AI provider/model usage summary for the last 30 days' })
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  getUsageSummary() {
    return this.aiManagementService.getUsageSummary();
  }

  @Put()
  @ApiOperation({ summary: 'Update AI parsing provider/model config' })
  @ApiSuccessResponse(AiConfigResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500] })
  updateConfig(
    @CurrentUser() admin: AuthUser,
    @Body() dto: UpdateAiConfigDto,
  ): Promise<AiConfigResponseDto> {
    return this.aiManagementService.updateConfig(dto, admin.id);
  }
}
