import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CandidateCvParseStatus } from '../../candidate/entities/candidate.enum';

export class CandidateCvResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  documentId: string;

  @ApiPropertyOptional({ nullable: true })
  title: string | null;

  @ApiProperty()
  isDefault: boolean;

  @ApiProperty({ enum: CandidateCvParseStatus })
  parseStatus: CandidateCvParseStatus;

  @ApiPropertyOptional({ nullable: true })
  parsedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
