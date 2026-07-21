import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AuthIdentityProvider } from './auth.enum';
import { User } from './user.entity';

@Entity('auth_identities')
@Index('uq_auth_identities_provider_user', ['provider', 'providerUserId'], { unique: true })
@Index('idx_auth_identities_user_provider', ['userId', 'provider'])
export class AuthIdentity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_auth_identities_id' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: AuthIdentityProvider,
    enumName: 'auth_identity_provider_enum',
  })
  provider: AuthIdentityProvider;

  @Column({ name: 'provider_user_id', type: 'varchar', length: 255 })
  providerUserId: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'email_verified', type: 'boolean', default: true })
  emailVerified: boolean;

  @Column({ name: 'full_name', type: 'varchar', length: 255, nullable: true })
  fullName: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({ name: 'linked_at', type: 'timestamptz', default: () => 'now()' })
  linkedAt: Date;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.authIdentities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_auth_identities_user_id' })
  user: User;
}
