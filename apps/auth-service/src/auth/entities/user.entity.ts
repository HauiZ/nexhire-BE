import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserStatus } from './auth.enum';
import { AuthIdentity } from './auth-identity.entity';
import { EmailVerification } from './email-verification.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { UserCredential } from './user-credential.entity';
import { UserRoleEntity } from './user-role.entity';

@Entity('users')
@Index('uq_users_email', ['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_users_id' })
  id: string;

  @Column({ length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ name: 'full_name', type: 'varchar', length: 255, nullable: true })
  fullName: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({ name: 'avatar_document_id', type: 'uuid', nullable: true })
  avatarDocumentId: string | null;

  @Column({
    type: 'enum',
    enum: UserStatus,
    enumName: 'user_status_enum',
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ name: 'email_verified', type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'status_reason', type: 'text', nullable: true })
  statusReason: string | null;

  @Column({ name: 'status_changed_by', type: 'uuid', nullable: true })
  statusChangedBy: string | null;

  @Column({ name: 'status_changed_at', type: 'timestamptz', nullable: true })
  statusChangedAt: Date | null;

  @Column({ name: 'suspended_at', type: 'timestamptz', nullable: true })
  suspendedAt: Date | null;

  @Column({ name: 'banned_at', type: 'timestamptz', nullable: true })
  bannedAt: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => UserCredential, (credential) => credential.user)
  credential: UserCredential;

  @OneToMany(() => UserRoleEntity, (userRole) => userRole.user)
  userRoles: UserRoleEntity[];

  @OneToMany(() => EmailVerification, (verification) => verification.user)
  emailVerifications: EmailVerification[];

  @OneToMany(() => PasswordResetToken, (token) => token.user)
  passwordResetTokens: PasswordResetToken[];

  @OneToMany(() => AuthIdentity, (identity) => identity.user)
  authIdentities: AuthIdentity[];
}
