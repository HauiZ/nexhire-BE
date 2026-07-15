import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  ApiSuccessResponse,
  AuthUser,
  CurrentUser,
  Roles,
  UserRole,
} from '@nexhire/shared';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NotificationResponseDto,
  UnreadNotificationCountDto,
} from './dto/notification-response.dto';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@Controller('notifications')
@Roles(UserRole.CANDIDATE, UserRole.RECRUITER)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List in-app notifications for the current user or company' })
  @ApiSuccessResponse(NotificationResponseDto, { isArray: true, paginated: true })
  @ApiErrorResponses({ statuses: [400, 401, 403, 500] })
  list(@CurrentUser() user: AuthUser, @Query() query: NotificationQueryDto) {
    return this.notificationService.list(user, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count unread in-app notifications' })
  @ApiSuccessResponse(UnreadNotificationCountDto)
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadNotificationCountDto> {
    return this.notificationService.unreadCount(user);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all scoped notifications as read' })
  @ApiSuccessResponse(UnreadNotificationCountDto)
  @ApiErrorResponses({ statuses: [401, 403, 500] })
  markAllRead(@CurrentUser() user: AuthUser): Promise<UnreadNotificationCountDto> {
    return this.notificationService.markAllRead(user);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ApiSuccessResponse(NotificationResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationResponseDto> {
    return this.notificationService.markRead(user, id);
  }
}
