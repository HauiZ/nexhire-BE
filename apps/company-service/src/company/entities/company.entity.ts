import { Entity, Column, Index } from 'typeorm';
import { CompanyStatus } from '@nexhire/shared';
import { BaseEntity } from '@nexhire/infra';
@Entity({ name: 'company' })
export class Company extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  logo: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', nullable: true })
  website: string;

  @Column({ type: 'varchar', nullable: true })
  address: string;

  @Index('uq_company_tax_code', { unique: true })
  @Column({ name: 'tax_code', type: 'varchar', length: 50, unique: true })
  taxCode: string;

  // Dùng ID để reference tới User (Owner). 
  // Vì User cũng nằm trong auth service, bạn có thể nối @OneToOne sau nếu cần.
  @Index('idx_company_owner_id')
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ type: 'enum', enum: CompanyStatus, default: CompanyStatus.PENDING })
  status: CompanyStatus;
}
