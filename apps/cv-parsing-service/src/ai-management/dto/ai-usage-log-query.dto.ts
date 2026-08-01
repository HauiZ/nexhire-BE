import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '@nexhire/shared';

import { CvParseProvider } from '../../cv-parsing/entities/cv-parsing.enum';

export enum AiUsageLogStatusFilter {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export class AiUsageLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CvParseProvider })
  @IsOptional()
  @IsEnum(CvParseProvider)
  provider?: CvParseProvider;

  @ApiPropertyOptional({ example: 'gpt-5.5' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ enum: AiUsageLogStatusFilter })
  @IsOptional()
  @IsEnum(AiUsageLogStatusFilter)
  status?: AiUsageLogStatusFilter;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-01T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ example: 'candidate-cv-id' })
  @IsOptional()
  @IsString()
  candidateCvId?: string;

  @Type(() => Number)
  override page: number = 1;

  @Type(() => Number)
  override limit: number = 20;
}
