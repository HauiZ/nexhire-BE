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

@Entity('email_verifications')
@Index('uq_email_verifications_token_hash', ['tokenHash'], { unique: true })
export class EmailVerification {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_email_verifications_id' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ length: 255 })
  email: string;

  @Column({ name: 'token_hash', type: 'text' })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'last_sent_at', type: 'timestamptz', default: () => 'now()' })
  lastSentAt: Date;

  @Column({ name: 'resend_count', type: 'int', default: 0 })
  resendCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.emailVerifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_email_verifications_user_id' })
  user: User;
}
