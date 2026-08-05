import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CvTemplatePresetStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum CvTemplatePresetCategory {
  IT = 'it',
  MARKETING = 'marketing',
  SALES = 'sales',
  HR = 'hr',
}

export type CvTemplatePresetI18n = Record<'vi' | 'en' | 'ja', string>;

@Entity('cv_template_presets')
@Index('uq_cv_template_presets_key', ['key'], { unique: true })
@Index('idx_cv_template_presets_status_sort', ['status', 'sortOrder'])
export class CvTemplatePreset {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_cv_template_presets_id',
  })
  id: string;

  @Column({ name: 'key', type: 'varchar', length: 80 })
  key: string;

  @Column({ name: 'name_i18n', type: 'jsonb' })
  nameI18n: CvTemplatePresetI18n;

  @Column({ name: 'description_i18n', type: 'jsonb' })
  descriptionI18n: CvTemplatePresetI18n;

  @Column({
    name: 'categories',
    type: 'enum',
    enum: CvTemplatePresetCategory,
    enumName: 'cv_template_preset_category_enum',
    array: true,
    default: () => '\'{}\'::"cv_template_preset_category_enum"[]',
  })
  categories: CvTemplatePresetCategory[];

  @Column({ name: 'accent', type: 'varchar', length: 32, nullable: true })
  accent: string | null;

  @Column({ name: 'thumbnail_url', type: 'varchar', length: 1000, nullable: true })
  thumbnailUrl: string | null;

  @Column({ name: 'canvas', type: 'jsonb' })
  canvas: Record<string, unknown>;

  @Column({
    name: 'status',
    type: 'enum',
    enum: CvTemplatePresetStatus,
    enumName: 'cv_template_preset_status_enum',
    default: CvTemplatePresetStatus.DRAFT,
  })
  status: CvTemplatePresetStatus;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
