import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { CvTemplatePresetCategory } from '../entities/cv-template-preset.entity';

export enum CvTemplatePresetCategoryFilter {
  ALL = 'all',
  IT = 'it',
  MARKETING = 'marketing',
  SALES = 'sales',
  HR = 'hr',
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return String(value).toLowerCase() === 'true';
}

export class ListCvTemplatePresetsQueryDto {
  @ApiPropertyOptional({
    enum: CvTemplatePresetCategoryFilter,
    default: CvTemplatePresetCategoryFilter.ALL,
  })
  @IsOptional()
  @IsEnum(CvTemplatePresetCategoryFilter)
  category?: CvTemplatePresetCategoryFilter | CvTemplatePresetCategory;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  includeCanvas?: boolean;
}
