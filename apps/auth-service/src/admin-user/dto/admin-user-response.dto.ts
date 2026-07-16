import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@nexhire/shared';
import { UserStatus } from '../../auth/entities/auth.enum';

export class AdminUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ nullable: true })
  fullName: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ enum: UserStatus })
  status: UserStatus;

  @ApiProperty({ type: [String], enum: UserRole })
  roles: UserRole[];

  @ApiProperty()
  emailVerified: boolean;

  @ApiPropertyOptional({ nullable: true })
  lastLoginAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  statusReason: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  statusChangedBy: string | null;

  @ApiPropertyOptional({ nullable: true })
  statusChangedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  suspendedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  bannedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  archivedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
