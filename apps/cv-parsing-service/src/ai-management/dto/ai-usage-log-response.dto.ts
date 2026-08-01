import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CvParseContext, CvParseProvider } from '../../cv-parsing/entities/cv-parsing.enum';

export class AiUsageLogResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  parseRequestId: string;

  @ApiProperty()
  candidateId: string;

  @ApiPropertyOptional({ nullable: true })
  candidateCvId: string | null;

  @ApiProperty({ enum: CvParseContext })
  context: CvParseContext;

  @ApiProperty({ enum: CvParseProvider })
  provider: CvParseProvider;

  @ApiProperty()
  model: string;

  @ApiProperty()
  operation: string;

  @ApiProperty({ enum: ['SUCCEEDED', 'FAILED'] })
  status: string;

  @ApiPropertyOptional({ nullable: true })
  latencyMs: number | null;

  @ApiPropertyOptional({ nullable: true })
  inputTokens: number | null;

  @ApiPropertyOptional({ nullable: true })
  outputTokens: number | null;

  @ApiPropertyOptional({ nullable: true })
  totalTokens: number | null;

  @ApiPropertyOptional({ nullable: true })
  estimatedCostUsd: string | null;

  @ApiPropertyOptional({ nullable: true })
  errorCode: string | null;

  @ApiPropertyOptional({ nullable: true })
  errorMessage: string | null;

  @ApiPropertyOptional({ nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiProperty()
  createdAt: Date;
}
