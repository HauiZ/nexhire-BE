import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CandidateProfile } from '../../candidate/entities/candidate-profile.entity';

@Entity('followed_companies')
@Index('uq_followed_companies_candidate_company', ['candidateId', 'companyId'], { unique: true })
@Index('idx_followed_companies_candidate_created_at', ['candidateId', 'createdAt'])
@Index('idx_followed_companies_candidate_user_created_at', ['candidateUserId', 'createdAt'])
@Index('idx_followed_companies_candidate_user_company', ['candidateUserId', 'companyId'])
@Index('idx_followed_companies_company_created_at', ['companyId', 'createdAt'])
export class FollowedCompany {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_followed_companies_id',
  })
  id: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => CandidateProfile, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'candidate_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_followed_companies_candidate_id',
  })
  candidate: CandidateProfile;

  @Column({ name: 'candidate_user_id', type: 'uuid' })
  candidateUserId: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'company_name', type: 'varchar', length: 255 })
  companyName: string;

  @Column({ name: 'company_logo_url', type: 'text', nullable: true })
  companyLogoUrl: string | null;

  @Column({ name: 'company_logo_document_id', type: 'uuid', nullable: true })
  companyLogoDocumentId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
