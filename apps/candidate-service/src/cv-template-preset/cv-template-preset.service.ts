import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ERROR_CODES, paginated } from '@nexhire/shared';
import { Brackets, DataSource, Repository } from 'typeorm';
import {
  AdminCvTemplatePresetQueryDto,
  AdminCvTemplatePresetSortOrderDto,
  CreateAdminCvTemplatePresetDto,
  UpdateAdminCvTemplatePresetDto,
} from './dto/admin-cv-template-preset-request.dto';
import { AdminCvTemplatePresetResponseDto } from './dto/admin-cv-template-preset-response.dto';
import { ListCvTemplatePresetsQueryDto } from './dto/cv-template-preset-query.dto';
import { CvTemplatePresetResponseDto } from './dto/cv-template-preset-response.dto';
import {
  CvTemplatePreset,
  CvTemplatePresetCategory,
  CvTemplatePresetI18n,
  CvTemplatePresetStatus,
} from './entities/cv-template-preset.entity';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCALES: Array<keyof CvTemplatePresetI18n> = ['vi', 'en', 'ja'];

@Injectable()
export class CvTemplatePresetService {
  constructor(
    private readonly dataSource: DataSource,
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

  async listAdmin(query: AdminCvTemplatePresetQueryDto): Promise<{
    data: AdminCvTemplatePresetResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const includeCanvas = query.includeCanvas ?? false;
    const qb = this.presetRepo
      .createQueryBuilder('preset')
      .withDeleted()
      .orderBy('preset.sortOrder', 'ASC')
      .addOrderBy('preset.updatedAt', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    if (query.status && query.status !== 'all') {
      qb.andWhere('preset.status = :status', { status: query.status });
    }

    if (query.category && query.category !== 'all') {
      qb.andWhere(':category = ANY(preset.categories)', {
        category: query.category as CvTemplatePresetCategory,
      });
    }

    const search = query.search?.trim().toLowerCase();
    if (search) {
      qb.andWhere(
        new Brackets((builder) => {
          const like = { search: `%${search}%` };
          builder
            .where('LOWER(preset.key) LIKE :search', like)
            .orWhere(`LOWER(COALESCE(preset.name_i18n ->> 'vi', '')) LIKE :search`, like)
            .orWhere(`LOWER(COALESCE(preset.name_i18n ->> 'en', '')) LIKE :search`, like)
            .orWhere(`LOWER(COALESCE(preset.name_i18n ->> 'ja', '')) LIKE :search`, like)
            .orWhere(`LOWER(COALESCE(preset.description_i18n ->> 'vi', '')) LIKE :search`, like)
            .orWhere(`LOWER(COALESCE(preset.description_i18n ->> 'en', '')) LIKE :search`, like)
            .orWhere(`LOWER(COALESCE(preset.description_i18n ->> 'ja', '')) LIKE :search`, like);
        }),
      );
    }

    const [presets, total] = await qb.getManyAndCount();
    return paginated(
      presets.map((preset) => this.mapAdminPreset(preset, includeCanvas)),
      total,
      query.page,
      query.limit,
    );
  }

  async getAdmin(id: string): Promise<AdminCvTemplatePresetResponseDto> {
    const preset = await this.findAdminPresetOrThrow(id);
    return this.mapAdminPreset(preset, true);
  }

  async createAdmin(
    dto: CreateAdminCvTemplatePresetDto,
  ): Promise<AdminCvTemplatePresetResponseDto> {
    await this.ensureKeyAvailable(dto.key.trim().toLowerCase());
    const preset = this.presetRepo.create({
      key: dto.key.trim().toLowerCase(),
      nameI18n: this.normalizeI18n(dto.defaultName, dto.name, undefined),
      descriptionI18n: this.normalizeI18n(dto.defaultDescription, dto.description, undefined),
      categories: dto.categories,
      accent: dto.accent ?? null,
      thumbnailUrl: this.normalizeOptionalText(dto.thumbnailUrl),
      canvas: this.validateCanvas(dto.canvas),
      status: CvTemplatePresetStatus.DRAFT,
      sortOrder: dto.sortOrder ?? 0,
      version: 1,
    });

    try {
      const saved = await this.presetRepo.save(preset);
      return this.mapAdminPreset(saved, true);
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException({
          code: ERROR_CODES.CV_TEMPLATE_PRESET.KEY_CONFLICT,
          message: 'CV template preset key already exists',
        });
      }
      throw error;
    }
  }

  async updateAdmin(
    id: string,
    dto: UpdateAdminCvTemplatePresetDto,
  ): Promise<AdminCvTemplatePresetResponseDto> {
    const preset = await this.findAdminPresetOrThrow(id);
    const nextKey = dto.key?.trim().toLowerCase();
    if (nextKey && nextKey !== preset.key) {
      await this.ensureKeyAvailable(nextKey, preset.id);
      preset.key = nextKey;
    }

    if (dto.defaultName !== undefined || dto.name !== undefined) {
      const fallbackName = dto.defaultName ?? this.firstLocaleValue(preset.nameI18n);
      preset.nameI18n = this.normalizeI18n(
        fallbackName,
        dto.name,
        preset.nameI18n,
        dto.defaultName !== undefined,
      );
    }

    if (dto.defaultDescription !== undefined || dto.description !== undefined) {
      const fallbackDescription =
        dto.defaultDescription ?? this.firstLocaleValue(preset.descriptionI18n);
      preset.descriptionI18n = this.normalizeI18n(
        fallbackDescription,
        dto.description,
        preset.descriptionI18n,
        dto.defaultDescription !== undefined,
      );
    }

    if (dto.categories) {
      preset.categories = dto.categories;
    }

    if (dto.accent !== undefined) {
      preset.accent = dto.accent ?? null;
    }

    if (dto.thumbnailUrl !== undefined) {
      preset.thumbnailUrl = this.normalizeOptionalText(dto.thumbnailUrl);
    }

    if (dto.canvas !== undefined) {
      preset.canvas = this.validateCanvas(dto.canvas);
      if (dto.thumbnailUrl === undefined) {
        preset.thumbnailUrl = null;
      }
      preset.version += 1;
    }

    if (dto.sortOrder !== undefined) {
      preset.sortOrder = dto.sortOrder;
    }

    try {
      const saved = await this.presetRepo.save(preset);
      return this.mapAdminPreset(saved, true);
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException({
          code: ERROR_CODES.CV_TEMPLATE_PRESET.KEY_CONFLICT,
          message: 'CV template preset key already exists',
        });
      }
      throw error;
    }
  }

  async publishAdmin(id: string): Promise<AdminCvTemplatePresetResponseDto> {
    const preset = await this.findAdminPresetOrThrow(id);
    preset.canvas = this.validateCanvas(preset.canvas);
    if (preset.deletedAt) {
      await this.presetRepo.restore(preset.id);
      preset.deletedAt = null;
    }
    preset.status = CvTemplatePresetStatus.PUBLISHED;
    const saved = await this.presetRepo.save(preset);
    return this.mapAdminPreset(saved, true);
  }

  async archiveAdmin(id: string): Promise<AdminCvTemplatePresetResponseDto> {
    const preset = await this.findAdminPresetOrThrow(id);
    if (preset.status === CvTemplatePresetStatus.ARCHIVED && preset.deletedAt) {
      return this.mapAdminPreset(preset, true);
    }
    preset.status = CvTemplatePresetStatus.ARCHIVED;
    await this.presetRepo.save(preset);
    await this.presetRepo.softDelete(preset.id);
    const archived = await this.findAdminPresetOrThrow(id);
    return this.mapAdminPreset(archived, true);
  }

  async restoreAdmin(id: string): Promise<AdminCvTemplatePresetResponseDto> {
    const preset = await this.findAdminPresetOrThrow(id);
    if (!preset.deletedAt && preset.status !== CvTemplatePresetStatus.ARCHIVED) {
      throw new ConflictException({
        code: ERROR_CODES.COMMON.CONFLICT,
        message: 'Only archived CV template presets can be restored',
      });
    }
    await this.presetRepo.restore(preset.id);
    preset.deletedAt = null;
    preset.status = CvTemplatePresetStatus.DRAFT;
    const restored = await this.presetRepo.save(preset);
    return this.mapAdminPreset(restored, true);
  }

  async updateSortOrder(
    dto: AdminCvTemplatePresetSortOrderDto,
  ): Promise<AdminCvTemplatePresetResponseDto[]> {
    const presets = await this.dataSource.transaction(async (manager) => {
      const updated: CvTemplatePreset[] = [];

      for (const item of dto.items) {
        const preset = await manager.findOne(CvTemplatePreset, {
          where: { id: item.id },
          withDeleted: true,
        });
        if (!preset) {
          throw new NotFoundException({
            code: ERROR_CODES.CV_TEMPLATE_PRESET.NOT_FOUND,
            message: 'CV template preset not found',
          });
        }

        preset.sortOrder = item.sortOrder;
        updated.push(preset);
      }

      return manager.save(CvTemplatePreset, updated);
    });
    presets.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return presets.map((preset) => this.mapAdminPreset(preset, true));
  }

  private mapPreset(preset: CvTemplatePreset, includeCanvas: boolean): CvTemplatePresetResponseDto {
    const thumbnailUrl = preset.thumbnailUrl ?? this.extractCanvasThumbnailUrl(preset.canvas);

    return {
      id: preset.id,
      key: preset.key,
      name: preset.nameI18n,
      description: preset.descriptionI18n,
      categories: preset.categories,
      accent: preset.accent,
      thumbnailUrl,
      canvas: includeCanvas ? preset.canvas : null,
      version: preset.version,
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt,
    };
  }

  private mapAdminPreset(
    preset: CvTemplatePreset,
    includeCanvas: boolean,
  ): AdminCvTemplatePresetResponseDto {
    return {
      ...this.mapPreset(preset, includeCanvas),
      status: preset.status,
      sortOrder: preset.sortOrder,
      deletedAt: preset.deletedAt,
      categories: preset.categories,
    };
  }

  private async findAdminPresetOrThrow(id: string): Promise<CvTemplatePreset> {
    const preset = await this.presetRepo
      .createQueryBuilder('preset')
      .withDeleted()
      .where('preset.id = :id', { id })
      .getOne();
    if (!preset) {
      throw new NotFoundException({
        code: ERROR_CODES.CV_TEMPLATE_PRESET.NOT_FOUND,
        message: 'CV template preset not found',
      });
    }
    return preset;
  }

  private async ensureKeyAvailable(key: string, ignoreId?: string): Promise<void> {
    const existing = await this.presetRepo.findOne({
      where: { key },
      withDeleted: true,
    });
    if (existing && existing.id !== ignoreId) {
      throw new ConflictException({
        code: ERROR_CODES.CV_TEMPLATE_PRESET.KEY_CONFLICT,
        message: 'CV template preset key already exists',
      });
    }
  }

  private normalizeOptionalText(value: string | null | undefined): string | null {
    const text = value?.trim();
    return text ? text : null;
  }

  private extractCanvasThumbnailUrl(
    canvas: Record<string, unknown> | null | undefined,
  ): string | null {
    const pages = Array.isArray(canvas?.pages) ? canvas.pages : [];
    for (const page of pages) {
      const elements = Array.isArray((page as { elements?: unknown }).elements)
        ? (page as { elements: unknown[] }).elements
        : [];
      const image = elements.find(
        (element): element is { type?: unknown; src?: unknown } =>
          typeof element === 'object' &&
          element !== null &&
          (element as { type?: unknown }).type === 'image' &&
          typeof (element as { src?: unknown }).src === 'string' &&
          ((element as { src: string }).src.startsWith('data:image/') ||
            (element as { src: string }).src.startsWith('http://') ||
            (element as { src: string }).src.startsWith('https://')),
      );
      const src = image?.src;
      if (typeof src === 'string') {
        return src;
      }
    }

    return null;
  }

  private normalizeI18n(
    fallback: string | undefined,
    incoming: Partial<CvTemplatePresetI18n> | undefined,
    previous: CvTemplatePresetI18n | undefined,
    replacePreviousWithFallback = false,
  ): CvTemplatePresetI18n {
    const resolvedFallback = fallback?.trim() || this.firstLocaleValue(previous) || '';
    const resolveLocale = (locale: keyof CvTemplatePresetI18n) => {
      const value = this.normalizeLocaleValue(incoming?.[locale]);
      if (value && (!replacePreviousWithFallback || value !== previous?.[locale])) {
        return value;
      }
      return replacePreviousWithFallback
        ? resolvedFallback
        : (previous?.[locale] ?? resolvedFallback);
    };

    return {
      vi: resolveLocale('vi'),
      en: resolveLocale('en'),
      ja: resolveLocale('ja'),
    };
  }

  private normalizeLocaleValue(value: string | undefined): string | undefined {
    const text = value?.trim();
    return text ? text : undefined;
  }

  private firstLocaleValue(value?: CvTemplatePresetI18n): string | undefined {
    if (!value) {
      return undefined;
    }
    return LOCALES.map((locale) => value[locale]).find((item) => Boolean(item));
  }

  private validateCanvas(canvas: Record<string, unknown>): Record<string, unknown> {
    if (
      typeof canvas !== 'object' ||
      canvas === null ||
      Array.isArray(canvas) ||
      !Array.isArray((canvas as { pages?: unknown }).pages)
    ) {
      throw new BadRequestException({
        code: ERROR_CODES.CV_TEMPLATE_PRESET.INVALID_CANVAS,
        message: 'Canvas must contain a pages array',
      });
    }

    const pages = (canvas as { pages: unknown[] }).pages;
    if (pages.length === 0) {
      throw new BadRequestException({
        code: ERROR_CODES.CV_TEMPLATE_PRESET.INVALID_CANVAS,
        message: 'Canvas must contain at least one page',
      });
    }

    const hasInvalidPage = pages.some((page) => {
      if (typeof page !== 'object' || page === null || Array.isArray(page)) {
        return true;
      }
      const typedPage = page as { id?: unknown; elements?: unknown };
      return typeof typedPage.id !== 'string' || !Array.isArray(typedPage.elements);
    });

    if (hasInvalidPage) {
      throw new BadRequestException({
        code: ERROR_CODES.CV_TEMPLATE_PRESET.INVALID_CANVAS,
        message: 'Each canvas page must have an id and elements array',
      });
    }

    return canvas;
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
