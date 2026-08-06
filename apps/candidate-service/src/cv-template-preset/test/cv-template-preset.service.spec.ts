import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  AdminCvTemplatePresetQueryDto,
  CreateAdminCvTemplatePresetDto,
} from '../dto/admin-cv-template-preset-request.dto';
import { ListCvTemplatePresetsQueryDto } from '../dto/cv-template-preset-query.dto';
import { CvTemplatePresetService } from '../cv-template-preset.service';
import {
  CvTemplatePreset,
  CvTemplatePresetCategory,
  CvTemplatePresetStatus,
} from '../entities/cv-template-preset.entity';

type MockRepo = {
  createQueryBuilder: jest.Mock;
  create: jest.Mock;
  findOne: jest.Mock;
  restore: jest.Mock;
  save: jest.Mock;
  softDelete: jest.Mock;
};

type MockQueryBuilder = {
  where: jest.Mock;
  andWhere: jest.Mock;
  withDeleted: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
  getManyAndCount: jest.Mock;
  getOne: jest.Mock;
};

function createRepo(): MockRepo {
  return {
    createQueryBuilder: jest.fn(),
    create: jest.fn((input) => createPreset(input)),
    findOne: jest.fn(),
    restore: jest.fn(),
    save: jest.fn((entity) => Promise.resolve(entity)),
    softDelete: jest.fn(),
  };
}

function createQueryBuilder(overrides: Partial<MockQueryBuilder> = {}): MockQueryBuilder {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    withDeleted: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
    ...overrides,
  };
  return qb;
}

function createValidCanvas(): Record<string, unknown> {
  return {
    id: 'template-custom',
    name: 'Custom',
    pages: [
      {
        id: 'template-custom-page-1',
        elements: [],
      },
    ],
  };
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

  it('lists all presets for admin and omits canvas by default', async () => {
    const query = new AdminCvTemplatePresetQueryDto();
    const qb = createQueryBuilder({
      getManyAndCount: jest.fn().mockResolvedValue([[createPreset()], 1]),
    });
    presetRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listAdmin(query);

    expect(qb.withDeleted).toHaveBeenCalled();
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(20);
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        key: 'professional',
        status: CvTemplatePresetStatus.PUBLISHED,
        sortOrder: 10,
        canvas: null,
      }),
    );
  });

  it('creates admin drafts and fills missing locales from default values', async () => {
    presetRepo.findOne.mockResolvedValue(null);

    const result = await service.createAdmin({
      key: 'custom-template',
      defaultName: 'Mẫu mới',
      defaultDescription: 'Mô tả mẫu mới',
      categories: [CvTemplatePresetCategory.IT],
      accent: '#2563eb',
      canvas: createValidCanvas(),
      sortOrder: 2,
    } as CreateAdminCvTemplatePresetDto);

    expect(presetRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'custom-template',
        status: CvTemplatePresetStatus.DRAFT,
        sortOrder: 2,
        nameI18n: {
          vi: 'Mẫu mới',
          en: 'Mẫu mới',
          ja: 'Mẫu mới',
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        key: 'custom-template',
        status: CvTemplatePresetStatus.DRAFT,
        canvas: createValidCanvas(),
      }),
    );
  });

  it('throws key conflict when creating a preset with an existing key', async () => {
    presetRepo.findOne.mockResolvedValue(createPreset({ id: 'other-id', key: 'custom-template' }));

    await expect(
      service.createAdmin({
        key: 'custom-template',
        defaultName: 'Mẫu mới',
        defaultDescription: 'Mô tả mẫu mới',
        categories: [CvTemplatePresetCategory.IT],
        canvas: createValidCanvas(),
      } as CreateAdminCvTemplatePresetDto),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('archives presets by status and soft delete', async () => {
    const archivedAt = new Date('2026-08-06T00:00:00.000Z');
    const activePreset = createPreset({
      canvas: createValidCanvas(),
      status: CvTemplatePresetStatus.PUBLISHED,
    });
    const archivedPreset = createPreset({
      canvas: createValidCanvas(),
      status: CvTemplatePresetStatus.ARCHIVED,
      deletedAt: archivedAt,
    });
    const firstQb = createQueryBuilder({
      getOne: jest.fn().mockResolvedValue(activePreset),
    });
    const secondQb = createQueryBuilder({
      getOne: jest.fn().mockResolvedValue(archivedPreset),
    });
    presetRepo.createQueryBuilder.mockReturnValueOnce(firstQb).mockReturnValueOnce(secondQb);

    const result = await service.archiveAdmin(activePreset.id);

    expect(presetRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: CvTemplatePresetStatus.ARCHIVED }),
    );
    expect(presetRepo.softDelete).toHaveBeenCalledWith(activePreset.id);
    expect(result).toEqual(
      expect.objectContaining({
        status: CvTemplatePresetStatus.ARCHIVED,
        deletedAt: archivedAt,
      }),
    );
  });
});
