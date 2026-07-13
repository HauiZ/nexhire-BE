import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('password_reset_tokens')
@Index('uq_password_reset_tokens_token_hash', ['tokenHash'], { unique: true })
@Index('idx_password_reset_tokens_email_used_at_created_at', ['email', 'usedAt', 'createdAt'])
@Index('idx_password_reset_tokens_user_id_used_at_created_at', ['userId', 'usedAt', 'createdAt'])
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_password_reset_tokens_id' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ length: 255 })
  email: string;

  @Column({ name: 'token_hash', type: 'text' })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'last_sent_at', type: 'timestamptz', default: () => 'now()' })
  lastSentAt: Date;

  @Column({ name: 'resend_count', type: 'int', default: 0 })
  resendCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_password_reset_tokens_user_id' })
  user: User;
}
