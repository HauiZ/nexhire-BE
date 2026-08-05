import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ERROR_CODES } from '@nexhire/shared';
import { Repository } from 'typeorm';
import { ListCvTemplatePresetsQueryDto } from './dto/cv-template-preset-query.dto';
import { CvTemplatePresetResponseDto } from './dto/cv-template-preset-response.dto';
import {
  CvTemplatePreset,
  CvTemplatePresetCategory,
  CvTemplatePresetStatus,
} from './entities/cv-template-preset.entity';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CvTemplatePresetService {
  constructor(
    @InjectRepository(CvTemplatePreset)
    private readonly presetRepo: Repository<CvTemplatePreset>,
  ) {}

  async listPublished(
    query: ListCvTemplatePresetsQueryDto,
  ): Promise<CvTemplatePresetResponseDto[]> {
    const includeCanvas = query.includeCanvas ?? true;
    const qb = this.presetRepo
      .createQueryBuilder('preset')
      .where('preset.status = :status', { status: CvTemplatePresetStatus.PUBLISHED })
      .andWhere('preset.deletedAt IS NULL')
      .orderBy('preset.sortOrder', 'ASC')
      .addOrderBy('preset.createdAt', 'ASC');

    if (query.category && query.category !== 'all') {
      qb.andWhere(':category = ANY(preset.categories)', {
        category: query.category as CvTemplatePresetCategory,
      });
    }

    const presets = await qb.getMany();
    return presets.map((preset) => this.mapPreset(preset, includeCanvas));
  }

  async getPublishedByIdOrKey(
    idOrKey: string,
    includeCanvas = true,
  ): Promise<CvTemplatePresetResponseDto> {
    const qb = this.presetRepo
      .createQueryBuilder('preset')
      .where('preset.status = :status', { status: CvTemplatePresetStatus.PUBLISHED })
      .andWhere('preset.deletedAt IS NULL');

    if (UUID_V4_PATTERN.test(idOrKey)) {
      qb.andWhere('preset.id = :id', { id: idOrKey });
    } else {
      qb.andWhere('preset.key = :key', { key: idOrKey });
    }

    const preset = await qb.getOne();
    if (!preset) {
      throw new NotFoundException({
        code: ERROR_CODES.CV_TEMPLATE_PRESET.NOT_FOUND,
        message: 'CV template preset not found',
      });
    }

    return this.mapPreset(preset, includeCanvas);
  }

  private mapPreset(
    preset: CvTemplatePreset,
    includeCanvas: boolean,
  ): CvTemplatePresetResponseDto {
    return {
      id: preset.id,
      key: preset.key,
      name: preset.nameI18n,
      description: preset.descriptionI18n,
      categories: preset.categories,
      accent: preset.accent,
      thumbnailUrl: preset.thumbnailUrl,
      canvas: includeCanvas ? preset.canvas : null,
      version: preset.version,
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt,
    };
  }
}
