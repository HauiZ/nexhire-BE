import { BaseEntity } from '@nexhire/infra';
import { CompanyStatus, CompanyTrustLevel } from '@nexhire/shared';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'companies' })
export class Company extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  logo: string | null;

  @Column({ name: 'logo_document_id', type: 'uuid', nullable: true })
  logoDocumentId: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  industry: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  size: string | null;

  @Column({ name: 'founded_year', type: 'integer', nullable: true })
  foundedYear: number | null;

  @Column({ type: 'text', nullable: true })
  mission: string | null;

  @Column({ type: 'text', nullable: true })
  culture: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  values: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  perks: string[];

  @Column({ name: 'hero_image_url', type: 'text', nullable: true })
  heroImageUrl: string | null;

  @Column({ name: 'hero_image_document_id', type: 'uuid', nullable: true })
  heroImageDocumentId: string | null;

  @Column({ type: 'varchar', nullable: true })
  website: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 255, nullable: true })
  contactEmail: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 30, nullable: true })
  contactPhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Index('uq_company_tax_code', { unique: true })
  @Column({ name: 'tax_code', type: 'varchar', length: 50 })
  taxCode: string;

  @Index('uq_company_owner_id', { unique: true })
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ type: 'enum', enum: CompanyStatus, default: CompanyStatus.PENDING })
  status: CompanyStatus;

  @Column({ name: 'status_reason', type: 'text', nullable: true })
  statusReason: string | null;

  @Column({ name: 'status_changed_at', type: 'timestamptz', nullable: true })
  statusChangedAt: Date | null;

  @Column({ name: 'status_changed_by_user_id', type: 'uuid', nullable: true })
  statusChangedByUserId: string | null;

  @Column({
    name: 'trust_level',
    type: 'enum',
    enum: CompanyTrustLevel,
    enumName: 'company_trust_level_enum',
    default: CompanyTrustLevel.MEDIUM,
  })
  trustLevel: CompanyTrustLevel;

  @Column({ name: 'approved_low_risk_count', type: 'integer', default: 0 })
  approvedLowRiskCount: number;

  @Column({ name: 'negative_trust_signal_count', type: 'integer', default: 0 })
  negativeTrustSignalCount: number;
}
