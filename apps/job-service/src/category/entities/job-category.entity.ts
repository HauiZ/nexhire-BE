import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('job_categories')
@Index('uq_job_categories_slug', ['slug'], { unique: true })
@Index('idx_job_categories_active_sort', ['isActive', 'sortOrder'])
export class JobCategory {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_job_categories_id',
  })
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'slug', type: 'varchar', length: 140 })
  slug: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
