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

import { CandidateDataSource, CandidateEmploymentType } from './candidate.enum';
import { CandidateProfile } from './candidate-profile.entity';

@Entity('candidate_experiences')
@Index('idx_candidate_experiences_candidate_id', ['candidateId'])
export class CandidateExperience {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_candidate_experiences_id',
  })
  id: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => CandidateProfile, (candidate) => candidate.experiences, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'candidate_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_candidate_experiences_candidate_id',
  })
  candidate: CandidateProfile;

  @Column({ name: 'company_name', type: 'varchar', length: 255 })
  companyName: string;

  @Column({ name: 'position', type: 'varchar', length: 255 })
  position: string;

  @Column({
    name: 'employment_type',
    type: 'enum',
    enum: CandidateEmploymentType,
    enumName: 'candidate_employment_type_enum',
    nullable: true,
  })
  employmentType: CandidateEmploymentType | null;

  @Column({ name: 'start_month', type: 'integer', nullable: true })
  startMonth: number | null;

  @Column({ name: 'start_year', type: 'integer', nullable: true })
  startYear: number | null;

  @Column({ name: 'end_month', type: 'integer', nullable: true })
  endMonth: number | null;

  @Column({ name: 'end_year', type: 'integer', nullable: true })
  endYear: number | null;

  @Column({ name: 'is_current', type: 'boolean', default: false })
  isCurrent: boolean;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'source',
    type: 'enum',
    enum: CandidateDataSource,
    enumName: 'candidate_data_source_enum',
    default: CandidateDataSource.MANUAL,
  })
  source: CandidateDataSource;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
