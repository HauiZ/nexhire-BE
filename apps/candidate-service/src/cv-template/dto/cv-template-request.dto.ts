import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  CvTemplateCreateSource,
  CvTemplateKey,
  CvTemplateSectionKey,
} from '../../candidate/entities/candidate.enum';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return String(value).toLowerCase() === 'true';
}

export class CreateCvTemplateFromCvDto {
  @ApiProperty({ enum: CvTemplateKey, example: CvTemplateKey.MODERN })
  @IsEnum(CvTemplateKey)
  templateKey: CvTemplateKey;

  @ApiPropertyOptional({ example: 'Backend Engineer CV' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}

export class CreateCvTemplateDto {
  @ApiProperty({ enum: CvTemplateKey, example: CvTemplateKey.MODERN })
  @IsEnum(CvTemplateKey)
  templateKey: CvTemplateKey;

  @ApiPropertyOptional({ example: 'Backend CV' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: CvTemplateCreateSource, example: CvTemplateCreateSource.DEFAULT })
  @IsOptional()
  @IsEnum(CvTemplateCreateSource)
  source?: CvTemplateCreateSource;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  @IsObject()
  theme?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  @IsObject()
  layout?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  @IsObject()
  contentSnapshot?: Record<string, unknown>;
}

export class UpdateCvTemplateDto {
  @ApiPropertyOptional({ example: 'Backend Engineer CV' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: CvTemplateKey })
  @IsOptional()
  @IsEnum(CvTemplateKey)
  templateKey?: CvTemplateKey;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  @IsObject()
  theme?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  @IsObject()
  layout?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  @IsObject()
  contentSnapshot?: Record<string, unknown>;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isDefault?: boolean;
}

export class SortCvTemplateSectionsDto {
  @ApiProperty({ enum: CvTemplateSectionKey, isArray: true })
  @IsArray()
  @IsEnum(CvTemplateSectionKey, { each: true })
  sectionKeys: CvTemplateSectionKey[];
}

export class SortCvTemplateItemsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  itemIds: string[];
}

export class ExportCvTemplateDto {
  @ApiPropertyOptional({ example: 'Backend Engineer CV - Modern' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isDefault?: boolean;
}
