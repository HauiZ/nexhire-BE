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

import { CandidateDataSource } from './candidate.enum';
import { CandidateProfile } from './candidate-profile.entity';

@Entity('candidate_educations')
@Index('idx_candidate_educations_candidate_id', ['candidateId'])
export class CandidateEducation {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_candidate_educations_id',
  })
  id: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => CandidateProfile, (candidate) => candidate.educations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'candidate_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_candidate_educations_candidate_id',
  })
  candidate: CandidateProfile;

  @Column({ name: 'school_name', type: 'varchar', length: 255 })
  schoolName: string;

  @Column({ name: 'degree', type: 'varchar', length: 255, nullable: true })
  degree: string | null;

  @Column({ name: 'field_of_study', type: 'varchar', length: 255, nullable: true })
  fieldOfStudy: string | null;

  @Column({ name: 'start_year', type: 'integer', nullable: true })
  startYear: number | null;

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
