import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CvTemplatePresetCategory } from '../entities/cv-template-preset.entity';

export class CvTemplatePresetResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'professional' })
  key: string;

  @ApiProperty({
    example: {
      vi: 'Chuyên nghiệp',
      en: 'Professional',
      ja: 'プロフェッショナル',
    },
  })
  name: Record<'vi' | 'en' | 'ja', string>;

  @ApiProperty({
    example: {
      vi: 'Header màu nổi bật, bố cục 1 cột rõ ràng.',
      en: 'A polished one-column layout with a strong header.',
      ja: '印象的なヘッダーを備えた明快な1カラム構成です。',
    },
  })
  description: Record<'vi' | 'en' | 'ja', string>;

  @ApiProperty({ enum: CvTemplatePresetCategory, isArray: true })
  categories: CvTemplatePresetCategory[];

  @ApiPropertyOptional({ nullable: true, example: '#2563eb' })
  accent: string | null;

  @ApiPropertyOptional({ nullable: true })
  thumbnailUrl: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    description: 'Serializable CanvasDocument used by the FE CV builder.',
  })
  canvas: Record<string, unknown> | null;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
