import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { CvParseProvider } from '../../cv-parsing/entities/cv-parsing.enum';

export class UpdateAiConfigDto {
  @ApiPropertyOptional({ enum: CvParseProvider, example: CvParseProvider.GEMINI })
  @IsOptional()
  @IsEnum(CvParseProvider)
  activeProvider?: CvParseProvider;

  @ApiPropertyOptional({ example: 'gemini-3.5-flash' })
  @IsOptional()
  @IsString()
  geminiModel?: string;

  @ApiPropertyOptional({ example: 'gpt-5.5' })
  @IsOptional()
  @IsString()
  openAiModel?: string;
}
