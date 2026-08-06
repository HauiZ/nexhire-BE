import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CvTemplatePresetStatus } from '../entities/cv-template-preset.entity';
import { CvTemplatePresetResponseDto } from './cv-template-preset-response.dto';

export class AdminCvTemplatePresetResponseDto extends CvTemplatePresetResponseDto {
  @ApiProperty({ enum: CvTemplatePresetStatus })
  status: CvTemplatePresetStatus;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  deletedAt: Date | null;
}
