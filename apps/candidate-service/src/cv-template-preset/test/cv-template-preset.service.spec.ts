import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ListCvTemplatePresetsQueryDto } from '../dto/cv-template-preset-query.dto';
import { CvTemplatePresetService } from '../cv-template-preset.service';
import {
  CvTemplatePreset,
  CvTemplatePresetCategory,
  CvTemplatePresetStatus,
} from '../entities/cv-template-preset.entity';

type MockRepo = {
  createQueryBuilder: jest.Mock;
};

type MockQueryBuilder = {
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  getMany: jest.Mock;
  getOne: jest.Mock;
};

function createRepo(): MockRepo {
  return {
    createQueryBuilder: jest.fn(),
  };
}

function createQueryBuilder(overrides: Partial<MockQueryBuilder> = {}): MockQueryBuilder {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getOne: jest.fn(),
    ...overrides,
  };
  return qb;
}

function createPreset(overrides: Partial<CvTemplatePreset> = {}): CvTemplatePreset {
  return {
    id: '0bafc70d-8a1e-4e56-83f6-cc0d16bbf895',
    key: 'professional',
    nameI18n: {
      vi: 'Chuyên nghiệp',
      en: 'Professional',
      ja: 'プロフェッショナル',
    },
    descriptionI18n: {
      vi: 'Header màu nổi bật.',
      en: 'A polished layout.',
      ja: '洗練されたレイアウトです。',
    },
    categories: [CvTemplatePresetCategory.IT, CvTemplatePresetCategory.HR],
    accent: '#2563eb',
    thumbnailUrl: null,
    canvas: {
      id: 'template-professional',
      name: 'Professional',
      pageSize: { width: 794, height: 1123 },
      pages: [],
    },
    status: CvTemplatePresetStatus.PUBLISHED,
    sortOrder: 10,
    version: 1,
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    updatedAt: new Date('2026-08-05T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('CvTemplatePresetService', () => {
  let service: CvTemplatePresetService;
  let presetRepo: MockRepo;

  beforeEach(() => {
    presetRepo = createRepo();
    service = new CvTemplatePresetService(presetRepo as unknown as Repository<CvTemplatePreset>);
  });

  it('lists published presets sorted for public catalog', async () => {
    const qb = createQueryBuilder({
      getMany: jest.fn().mockResolvedValue([createPreset()]),
    });
    presetRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listPublished(new ListCvTemplatePresetsQueryDto());

    expect(qb.where).toHaveBeenCalledWith('preset.status = :status', {
      status: CvTemplatePresetStatus.PUBLISHED,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('preset.deletedAt IS NULL');
    expect(qb.orderBy).toHaveBeenCalledWith('preset.sortOrder', 'ASC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('preset.createdAt', 'ASC');
    expect(result).toEqual([
      expect.objectContaining({
        key: 'professional',
        canvas: expect.objectContaining({ id: 'template-professional' }),
      }),
    ]);
  });

  it('filters published presets by category', async () => {
    const qb = createQueryBuilder({
      getMany: jest.fn().mockResolvedValue([createPreset()]),
    });
    presetRepo.createQueryBuilder.mockReturnValue(qb);

    await service.listPublished({ category: CvTemplatePresetCategory.IT });

    expect(qb.andWhere).toHaveBeenCalledWith(':category = ANY(preset.categories)', {
      category: CvTemplatePresetCategory.IT,
    });
  });

  it('can omit canvas payload for lightweight catalog requests', async () => {
    const qb = createQueryBuilder({
      getMany: jest.fn().mockResolvedValue([createPreset()]),
    });
    presetRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listPublished({ includeCanvas: false });

    expect(result[0].canvas).toBeNull();
  });

  it('gets a published preset by uuid', async () => {
    const qb = createQueryBuilder({
      getOne: jest.fn().mockResolvedValue(createPreset()),
    });
    presetRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getPublishedByIdOrKey('0bafc70d-8a1e-4e56-83f6-cc0d16bbf895');

    expect(qb.andWhere).toHaveBeenCalledWith('preset.id = :id', {
      id: '0bafc70d-8a1e-4e56-83f6-cc0d16bbf895',
    });
    expect(result.key).toBe('professional');
  });

  it('gets a published preset by key', async () => {
    const qb = createQueryBuilder({
      getOne: jest.fn().mockResolvedValue(createPreset({ key: 'modern' })),
    });
    presetRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getPublishedByIdOrKey('modern');

    expect(qb.andWhere).toHaveBeenCalledWith('preset.key = :key', { key: 'modern' });
    expect(result.key).toBe('modern');
  });

  it('throws not found for missing or unpublished presets', async () => {
    const qb = createQueryBuilder({
      getOne: jest.fn().mockResolvedValue(null),
    });
    presetRepo.createQueryBuilder.mockReturnValue(qb);

    await expect(service.getPublishedByIdOrKey('archived-template')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
