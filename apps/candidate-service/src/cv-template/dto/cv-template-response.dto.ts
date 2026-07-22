import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  CvTemplateKey,
  CvTemplateSectionKey,
} from '../../candidate/entities/candidate.enum';

export class CvTemplateResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  candidateId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: CvTemplateKey })
  templateKey: CvTemplateKey;

  @ApiPropertyOptional({ nullable: true })
  sourceDocumentId: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceDocumentDeletedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  sourceDocumentDeleteError: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceCvId: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceParseRequestId: string | null;

  @ApiProperty({ type: 'object' })
  theme: Record<string, unknown>;

  @ApiProperty({ type: 'object' })
  layout: Record<string, unknown>;

  @ApiProperty({ type: 'object' })
  contentSnapshot: Record<string, unknown>;

  @ApiProperty()
  isDefault: boolean;

  @ApiPropertyOptional({ nullable: true })
  lastExportedCvId: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastExportedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class CvTemplateOptionsResponseDto {
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        label: { type: 'string' },
        description: { type: 'string' },
      },
    },
  })
  templates: Array<{ key: CvTemplateKey; label: string; description: string }>;

  @ApiProperty({ enum: CvTemplateSectionKey, isArray: true })
  sections: CvTemplateSectionKey[];

  @ApiProperty({ enum: CvTemplateSectionKey, isArray: true })
  sortableItemSections: CvTemplateSectionKey[];
}

export class DeleteCvTemplateResponseDto {
  @ApiProperty()
  deleted: true;
}
