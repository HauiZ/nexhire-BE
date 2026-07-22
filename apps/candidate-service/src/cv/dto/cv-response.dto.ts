import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CandidateCvParseStatus, CandidateCvSource } from '../../candidate/entities/candidate.enum';

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

  @ApiProperty({ enum: CandidateCvSource })
  source: CandidateCvSource;

  @ApiPropertyOptional({ nullable: true })
  sourceTemplateId: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceCvId: string | null;

  @ApiPropertyOptional({ nullable: true })
  parsedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
