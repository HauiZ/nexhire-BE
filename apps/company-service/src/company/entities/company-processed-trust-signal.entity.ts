import { CreateDateColumn, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('company_processed_trust_signals')
@Index('uq_company_processed_trust_signals_target', ['targetType', 'targetId'], { unique: true })
export class CompanyProcessedTrustSignal {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_company_processed_trust_signals_id',
  })
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'target_type', type: 'varchar', length: 20 })
  targetType: string;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @CreateDateColumn({ name: 'processed_at', type: 'timestamptz' })
  processedAt: Date;
}
