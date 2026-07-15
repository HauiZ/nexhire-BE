import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MarkCandidateCvParseFailedDto {
  @ApiPropertyOptional({ example: 'Resume parser is temporarily unavailable' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  errorMessage?: string;
}
