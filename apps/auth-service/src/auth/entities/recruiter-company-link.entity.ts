import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('recruiter_company_links')
@Index('uq_recruiter_company_links_user_id', ['userId'], { unique: true })
@Index('idx_recruiter_company_links_company_id', ['companyId'])
export class RecruiterCompanyLink {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_recruiter_company_links_id' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'company_name', type: 'varchar', length: 255, nullable: true })
  companyName: string | null;

  @Column({ name: 'company_logo_url', type: 'text', nullable: true })
  companyLogoUrl: string | null;

  @Column({ name: 'company_status', type: 'varchar', length: 30 })
  companyStatus: string;

  @Column({ name: 'last_synced_at', type: 'timestamptz' })
  lastSyncedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
