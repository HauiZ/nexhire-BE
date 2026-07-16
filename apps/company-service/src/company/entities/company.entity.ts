import { BaseEntity } from '@nexhire/infra';
import { CompanyStatus, CompanyTrustLevel } from '@nexhire/shared';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'companies' })
export class Company extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  logo: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  website: string | null;

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
