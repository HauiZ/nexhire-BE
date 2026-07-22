import { ApiProperty } from '@nestjs/swagger';

import { ParsedResume } from '@nexhire/shared';

export class ManualGeminiCvParseResponseDto {
  @ApiProperty({ example: 'Manual Gemini CV parse completed' })
  message: string;

  @ApiProperty({ type: 'object' })
  normalizedPayload: ParsedResume;

  @ApiProperty({ type: 'object' })
  rawProviderPayload: Record<string, unknown>;
}
