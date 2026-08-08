import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ParsedResume } from '@nexhire/shared';

import { CvParseProvider, CvParseRequestStatus } from '../../cv-parsing/entities/cv-parsing.enum';
import { CanvasDocument, SanitizeReport } from '../canvas.types';
import { CvTemplateDesignJob } from '../entities/cv-template-design-job.entity';

export class CvTemplateDesignJobResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: CvParseRequestStatus })
  status: CvParseRequestStatus;

  @ApiProperty({ enum: CvParseProvider })
  provider: CvParseProvider;

  @ApiPropertyOptional({ nullable: true, example: 'gpt-4o' })
  providerVersion: string | null;

  @ApiProperty({ example: 'mau-cv-designer.pdf' })
  sourceFileName: string;

  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    description: 'CanvasDocument đã sanitize, dán thẳng vào ô Canvas JSON của preset.',
  })
  canvas: CanvasDocument | null;

  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    description: 'Dữ liệu AI đọc được, để admin đối chiếu.',
  })
  parsedResume: ParsedResume | null;

  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    description: 'Bao nhiêu element bị loại và vì sao — preview không nói được điều này.',
  })
  sanitizeReport: SanitizeReport | null;

  @ApiPropertyOptional({ nullable: true })
  errorCode: string | null;

  @ApiPropertyOptional({ nullable: true })
  errorMessage: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  finishedAt: Date | null;

  static fromEntity(job: CvTemplateDesignJob): CvTemplateDesignJobResponseDto {
    return {
      id: job.id,
      status: job.status,
      provider: job.provider,
      providerVersion: job.providerVersion,
      sourceFileName: job.sourceFileName,
      canvas: job.canvas,
      parsedResume: job.parsedResume,
      sanitizeReport: job.sanitizeReport,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    };
  }
}
