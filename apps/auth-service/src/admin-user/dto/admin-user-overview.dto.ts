import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@nexhire/shared';
import { UserStatus } from '../../auth/entities/auth.enum';

export class AdminUserOverviewDto {
  @ApiProperty({ example: 120 })
  total: number;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  byStatus: Record<UserStatus, number>;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  byRole: Record<UserRole, number>;

  @ApiProperty({ example: 96 })
  emailVerified: number;

  @ApiProperty({ example: 24 })
  emailUnverified: number;
}
