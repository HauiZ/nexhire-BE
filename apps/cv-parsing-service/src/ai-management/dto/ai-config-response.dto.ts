import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CvParseProvider } from '../../cv-parsing/entities/cv-parsing.enum';

export class SupportedAiModelDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  isDefault: boolean;
}

export class CurrentAiConfigDto {
  @ApiProperty({ enum: CvParseProvider, example: CvParseProvider.GEMINI })
  activeProvider: CvParseProvider;

  @ApiProperty({ example: 'gemini-3.5-flash' })
  geminiModel: string;

  @ApiProperty({ example: 'gpt-5.5' })
  openAiModel: string;

  @ApiPropertyOptional({ nullable: true })
  updatedByUserId: string | null;

  @ApiPropertyOptional({ nullable: true })
  updatedAt: Date | null;
}

export class SupportedAiModelsDto {
  @ApiProperty({ type: [SupportedAiModelDto] })
  GEMINI: SupportedAiModelDto[];

  @ApiProperty({ type: [SupportedAiModelDto] })
  OPENAI: SupportedAiModelDto[];
}

export class AiConfigResponseDto {
  @ApiProperty({ type: CurrentAiConfigDto })
  currentConfig: CurrentAiConfigDto;

  @ApiProperty({ type: SupportedAiModelsDto })
  supportedModels: SupportedAiModelsDto;
}
