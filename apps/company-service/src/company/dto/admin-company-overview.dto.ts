import { ApiProperty } from '@nestjs/swagger';
import { CompanyStatus, CompanyTrustLevel } from '@nexhire/shared';

export class AdminCompanyOverviewDto {
  @ApiProperty({ example: 24 })
  total: number;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  byStatus: Record<CompanyStatus, number>;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  byTrustLevel: Record<CompanyTrustLevel, number>;

  @ApiProperty({ example: 3 })
  pendingReviewAgain: number;

  @ApiProperty({ example: 8 })
  rejectedBefore: number;
}
