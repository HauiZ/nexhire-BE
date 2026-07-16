import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AdminUserService } from './admin-user.service';
import { AdminUserActionDto, AdminUserRestoreDto } from './dto/admin-user-action.dto';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';

@ApiTags('admin-users')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Get()
  @ApiOperation({ summary: 'List users for admin management' })
  @ApiSuccessResponse(AdminUserResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [401, 403, 422, 500] })
  list(@Query() query: AdminUserQueryDto) {
    return this.adminUserService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user detail for admin management' })
  @ApiSuccessResponse(AdminUserResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserResponseDto> {
    return this.adminUserService.get(id);
  }

  @Patch(':id/suspend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Suspend a user account' })
  @ApiSuccessResponse(AdminUserResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500] })
  suspend(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUserActionDto,
  ): Promise<AdminUserResponseDto> {
    return this.adminUserService.suspend(admin, id, dto);
  }

  @Patch(':id/ban')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ban a user account for policy violations' })
  @ApiSuccessResponse(AdminUserResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500] })
  ban(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUserActionDto,
  ): Promise<AdminUserResponseDto> {
    return this.adminUserService.ban(admin, id, dto);
  }

  @Patch(':id/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive a user account as soft delete' })
  @ApiSuccessResponse(AdminUserResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500] })
  archive(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUserActionDto,
  ): Promise<AdminUserResponseDto> {
    return this.adminUserService.archive(admin, id, dto);
  }

  @Patch(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore a suspended, banned, archived, inactive, or locked user' })
  @ApiSuccessResponse(AdminUserResponseDto)
  @ApiErrorResponses({ statuses: [400, 401, 403, 404, 422, 500] })
  restore(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUserRestoreDto,
  ): Promise<AdminUserResponseDto> {
    return this.adminUserService.restore(admin, id, dto);
  }
}
