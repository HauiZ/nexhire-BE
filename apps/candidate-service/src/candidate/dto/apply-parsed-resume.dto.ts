import { IsObject, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ParsedResume } from '@nexhire/shared';

export class ApplyParsedResumeDto {
  @ApiPropertyOptional({ example: 'bb4f26c9-2bb3-4177-8483-ff057db9f675' })
  @IsOptional()
  @IsUUID()
  candidateCvId?: string;

  @ApiProperty({ type: 'object' })
  @IsObject()
  parsedResume: ParsedResume;
}
