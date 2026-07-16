import { ApiProperty } from '@nestjs/swagger';
import { CompanyTrustLevel } from '@nexhire/shared';
import { CompanyResponseDto } from './company-response.dto';

export class AdminCompanyResponseDto extends CompanyResponseDto {
  @ApiProperty({ enum: CompanyTrustLevel, example: CompanyTrustLevel.MEDIUM })
  trustLevel: CompanyTrustLevel;

  @ApiProperty({ example: 0 })
  approvedLowRiskCount: number;

  @ApiProperty({ example: 0 })
  negativeTrustSignalCount: number;
}
