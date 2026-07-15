import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import {
  NotificationRecipientType,
  NotificationSenderType,
  NotificationType,
} from './notification.enum';

@Entity('notifications')
@Index('idx_notifications_recipient_user_created_at', ['recipientUserId', 'createdAt'])
@Index('idx_notifications_recipient_company_created_at', ['recipientCompanyId', 'createdAt'])
@Index('idx_notifications_read_at', ['readAt'])
@Index('idx_notifications_dedupe_key', ['dedupeKey'], { unique: true })
export class Notification {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_notifications_id',
  })
  id: string;

  @Column({
    name: 'recipient_type',
    type: 'enum',
    enum: NotificationRecipientType,
    enumName: 'notification_recipient_type_enum',
  })
  recipientType: NotificationRecipientType;

  @Column({ name: 'recipient_user_id', type: 'uuid', nullable: true })
  recipientUserId: string | null;

  @Column({ name: 'recipient_company_id', type: 'uuid', nullable: true })
  recipientCompanyId: string | null;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 255 })
  dedupeKey: string;

  @Column({
    name: 'sender_type',
    type: 'enum',
    enum: NotificationSenderType,
    enumName: 'notification_sender_type_enum',
    default: NotificationSenderType.SYSTEM,
  })
  senderType: NotificationSenderType;

  @Column({ name: 'sender_entity_id', type: 'uuid', nullable: true })
  senderEntityId: string | null;

  @Column({ name: 'sender_name', type: 'varchar', length: 255, nullable: true })
  senderName: string | null;

  @Column({ name: 'sender_avatar_document_id', type: 'uuid', nullable: true })
  senderAvatarDocumentId: string | null;

  @Column({ name: 'sender_logo_url', type: 'text', nullable: true })
  senderLogoUrl: string | null;

  @Column({
    name: 'type',
    type: 'enum',
    enum: NotificationType,
    enumName: 'notification_type_enum',
  })
  type: NotificationType;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'body', type: 'text' })
  body: string;

  @Column({ name: 'data', type: 'jsonb', default: () => "'{}'::jsonb" })
  data: Record<string, unknown>;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
