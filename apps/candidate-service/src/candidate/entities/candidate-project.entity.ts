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

@Entity('candidate_projects')
@Index('idx_candidate_projects_candidate_id', ['candidateId'])
export class CandidateProject {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_candidate_projects_id',
  })
  id: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => CandidateProfile, (candidate) => candidate.projects, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'candidate_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_candidate_projects_candidate_id',
  })
  candidate: CandidateProfile;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'technologies', type: 'text', array: true, default: () => "'{}'" })
  technologies: string[];

  @Column({ name: 'project_url', type: 'text', nullable: true })
  projectUrl: string | null;

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
