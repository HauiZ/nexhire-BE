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

import { CandidateDataSource, CandidateSkillLevel } from './candidate.enum';
import { CandidateProfile } from './candidate-profile.entity';

@Entity('candidate_skills')
@Index('uq_candidate_skills_candidate_normalized_name', ['candidateId', 'normalizedName'], {
  unique: true,
})
export class CandidateSkill {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_candidate_skills_id',
  })
  id: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => CandidateProfile, (candidate) => candidate.skills, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'candidate_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_candidate_skills_candidate_id',
  })
  candidate: CandidateProfile;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'normalized_name', type: 'varchar', length: 120 })
  normalizedName: string;

  @Column({
    name: 'level',
    type: 'enum',
    enum: CandidateSkillLevel,
    enumName: 'candidate_skill_level_enum',
    nullable: true,
  })
  level: CandidateSkillLevel | null;

  @Column({ name: 'years_of_experience', type: 'double precision', nullable: true })
  yearsOfExperience: number | null;

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
