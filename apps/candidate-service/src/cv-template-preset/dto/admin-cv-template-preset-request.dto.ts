import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsInt,
  IsObject,
  IsOptional,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@nexhire/shared';
import {
  CvTemplatePresetCategory,
  CvTemplatePresetStatus,
} from '../entities/cv-template-preset.entity';
import { CvTemplatePresetCategoryFilter } from './cv-template-preset-query.dto';

export enum AdminCvTemplatePresetStatusFilter {
  ALL = 'all',
  DRAFT = CvTemplatePresetStatus.DRAFT,
  PUBLISHED = CvTemplatePresetStatus.PUBLISHED,
  ARCHIVED = CvTemplatePresetStatus.ARCHIVED,
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

export class AdminCvTemplatePresetI18nInputDto {
  @ApiPropertyOptional({ example: 'Chuyên nghiệp' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  vi?: string;

  @ApiPropertyOptional({ example: 'Professional' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  en?: string;

  @ApiPropertyOptional({ example: 'プロフェッショナル' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  ja?: string;
}

export class AdminCvTemplatePresetSortItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  sortOrder: number;
}

export class AdminCvTemplatePresetSortOrderDto {
  @ApiProperty({ type: [AdminCvTemplatePresetSortItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AdminCvTemplatePresetSortItemDto)
  items: AdminCvTemplatePresetSortItemDto[];
}

export class AdminCvTemplatePresetQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'search by key or localized name/description' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ enum: AdminCvTemplatePresetStatusFilter, default: AdminCvTemplatePresetStatusFilter.ALL })
  @IsOptional()
  @IsEnum(AdminCvTemplatePresetStatusFilter)
  status?: AdminCvTemplatePresetStatusFilter;

  @ApiPropertyOptional({ enum: CvTemplatePresetCategoryFilter, default: CvTemplatePresetCategoryFilter.ALL })
  @IsOptional()
  @IsEnum(CvTemplatePresetCategoryFilter)
  category?: CvTemplatePresetCategoryFilter | CvTemplatePresetCategory;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  includeCanvas?: boolean;
}

export class CreateAdminCvTemplatePresetDto {
  @ApiProperty({ example: 'professional' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(80)
  key: string;

  @ApiProperty({ example: 'Professional' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  defaultName: string;

  @ApiProperty({ example: 'A polished one-column layout with a strong header.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  defaultDescription: string;

  @ApiPropertyOptional({ type: AdminCvTemplatePresetI18nInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdminCvTemplatePresetI18nInputDto)
  name?: AdminCvTemplatePresetI18nInputDto;

  @ApiPropertyOptional({ type: AdminCvTemplatePresetI18nInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdminCvTemplatePresetI18nInputDto)
  description?: AdminCvTemplatePresetI18nInputDto;

  @ApiProperty({ enum: CvTemplatePresetCategory, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(CvTemplatePresetCategory, { each: true })
  categories: CvTemplatePresetCategory[];

  @ApiPropertyOptional({ example: '#2563eb' })
  @IsOptional()
  @IsHexColor()
  accent?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/cv-template.png' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  thumbnailUrl?: string;

  @ApiProperty({ type: 'object', description: 'Canvas document JSON used by the CV builder.' })
  @IsObject()
  canvas: Record<string, unknown>;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateAdminCvTemplatePresetDto extends PartialType(CreateAdminCvTemplatePresetDto) {}
