import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CvParseContext, CvParseProvider, CvParseRequestStatus } from '../entities/cv-parsing.enum';

export class CvParseRequestResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  candidateId: string;

  @ApiProperty()
  requestedByUserId: string;

  @ApiProperty()
  candidateCvId: string;

  @ApiProperty()
  documentId: string;

  @ApiProperty({ enum: CvParseContext })
  context: CvParseContext;

  @ApiProperty({ enum: CvParseRequestStatus })
  status: CvParseRequestStatus;

  @ApiProperty({ enum: CvParseProvider })
  provider: CvParseProvider;

  @ApiPropertyOptional({ nullable: true })
  providerVersion: string | null;

  @ApiProperty()
  createdAt: Date;
}
