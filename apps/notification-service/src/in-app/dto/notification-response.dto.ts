import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NotificationRecipientType,
  NotificationSenderType,
  NotificationType,
} from '../entities/notification.enum';

export class NotificationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: NotificationRecipientType })
  recipientType: NotificationRecipientType;

  @ApiPropertyOptional({ nullable: true })
  recipientUserId: string | null;

  @ApiPropertyOptional({ nullable: true })
  recipientCompanyId: string | null;

  @ApiProperty({ enum: NotificationSenderType })
  senderType: NotificationSenderType;

  @ApiPropertyOptional({ nullable: true })
  senderEntityId: string | null;

  @ApiPropertyOptional({ nullable: true })
  senderName: string | null;

  @ApiPropertyOptional({ nullable: true })
  senderAvatarDocumentId: string | null;

  @ApiPropertyOptional({ nullable: true })
  senderLogoUrl: string | null;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ type: Object })
  data: Record<string, unknown>;

  @ApiPropertyOptional({ nullable: true })
  readAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class UnreadNotificationCountDto {
  @ApiProperty()
  count: number;
}
