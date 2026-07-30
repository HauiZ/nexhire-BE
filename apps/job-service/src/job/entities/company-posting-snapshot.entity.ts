import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { CompanyStatusSnapshot, CompanyTrustLevel } from './job.enum';

@Entity('company_posting_snapshots')
export class CompanyPostingSnapshot {
  @PrimaryColumn({
    name: 'company_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_company_posting_snapshots_company_id',
  })
  companyId: string;

  @Column({ name: 'company_name', type: 'varchar', length: 255, nullable: true })
  companyName: string | null;

  @Column({ name: 'company_logo_url', type: 'text', nullable: true })
  companyLogoUrl: string | null;

  @Column({ name: 'company_logo_document_id', type: 'uuid', nullable: true })
  companyLogoDocumentId: string | null;

  @Column({
    name: 'company_status',
    type: 'enum',
    enum: CompanyStatusSnapshot,
    enumName: 'company_status_snapshot_enum',
  })
  companyStatus: CompanyStatusSnapshot;

  @Column({
    name: 'company_trust_level',
    type: 'enum',
    enum: CompanyTrustLevel,
    enumName: 'company_trust_level_enum',
    default: CompanyTrustLevel.MEDIUM,
  })
  companyTrustLevel: CompanyTrustLevel;

  @Column({ name: 'snapshot_at', type: 'timestamptz' })
  snapshotAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
