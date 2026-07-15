import { IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ParsedResume } from '@nexhire/shared';

export class CompleteCvParseRequestDto {
  @ApiProperty({ type: 'object' })
  @IsObject()
  normalizedPayload: ParsedResume;

  @ApiPropertyOptional({ type: 'object', nullable: true })
  @IsOptional()
  @IsObject()
  rawProviderPayload?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: 'object', nullable: true })
  @IsOptional()
  @IsObject()
  confidence?: Record<string, unknown> | null;
}
