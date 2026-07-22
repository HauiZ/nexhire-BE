import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ParsedResume } from '@nexhire/shared';

import { CvParseProvider } from '../entities/cv-parsing.enum';

export class CvParseResultResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  parseRequestId: string;

  @ApiProperty()
  candidateId: string;

  @ApiPropertyOptional({ nullable: true })
  candidateCvId: string | null;

  @ApiProperty()
  documentId: string;

  @ApiProperty({ enum: CvParseProvider })
  provider: CvParseProvider;

  @ApiPropertyOptional({ nullable: true })
  providerVersion: string | null;

  @ApiProperty({ type: 'object' })
  normalizedPayload: ParsedResume;

  @ApiProperty()
  profileApplied: boolean;

  @ApiProperty()
  createdAt: Date;
}
