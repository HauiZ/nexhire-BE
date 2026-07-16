import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyTrustLevel } from '@nexhire/shared';
import {
  CompanyTrustChangeDirection,
  CompanyTrustChangeSource,
} from '../entities/company-trust-history.entity';

export class CompanyTrustHistoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  companyId: string;

  @ApiProperty({ enum: CompanyTrustLevel })
  previousTrustLevel: CompanyTrustLevel;

  @ApiProperty({ enum: CompanyTrustLevel })
  newTrustLevel: CompanyTrustLevel;

  @ApiProperty({ enum: CompanyTrustChangeDirection })
  direction: CompanyTrustChangeDirection;

  @ApiProperty({ enum: CompanyTrustChangeSource })
  source: CompanyTrustChangeSource;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  changedByUserId: string | null;

  @ApiProperty()
  reason: string;

  @ApiProperty()
  metadata: Record<string, unknown>;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}
