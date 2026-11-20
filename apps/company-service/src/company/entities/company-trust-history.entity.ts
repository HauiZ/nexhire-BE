import { CompanyTrustLevel } from '@nexhire/shared';
import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Company } from './company.entity';

export enum CompanyTrustChangeSource {
  MANUAL = 'MANUAL',
  AUTO = 'AUTO',
}

export enum CompanyTrustChangeDirection {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
}

@Entity('company_trust_histories')
@Index('idx_company_trust_histories_company_created_at', ['companyId', 'createdAt'])
export class CompanyTrustHistory {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_company_trust_histories_id' })
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  @ForeignKey(() => Company, { name: 'fk_company_trust_histories_company_id', onDelete: 'RESTRICT' })
  companyId: string;

  @Column({
    name: 'previous_trust_level',
    type: 'enum',
    enum: CompanyTrustLevel,
    enumName: 'company_trust_level_enum',
  })
  previousTrustLevel: CompanyTrustLevel;

  @Column({
    name: 'new_trust_level',
    type: 'enum',
    enum: CompanyTrustLevel,
    enumName: 'company_trust_level_enum',
  })
  newTrustLevel: CompanyTrustLevel;

  @Column({
    type: 'enum',
    enum: CompanyTrustChangeDirection,
    enumName: 'company_trust_change_direction_enum',
  })
  direction: CompanyTrustChangeDirection;

  @Column({
    type: 'enum',
    enum: CompanyTrustChangeSource,
    enumName: 'company_trust_change_source_enum',
  })
  source: CompanyTrustChangeSource;

  @Column({ name: 'changed_by_user_id', type: 'uuid', nullable: true })
  changedByUserId: string | null;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
