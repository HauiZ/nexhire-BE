import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

import type { MatchExplanation } from '@nexhire/shared';

import { MatchProvider, MatchResultStatus } from './matching.enum';

@Entity('match_results')
@Index('idx_match_results_job_id', ['jobId'])
@Index('idx_match_results_candidate_id', ['candidateId'])
@Index('idx_match_results_candidate_cv_id', ['candidateCvId'])
@Index('idx_match_results_job_candidate_cv', ['jobId', 'candidateId', 'candidateCvId'])
export class MatchResult {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_match_results_id',
  })
  id: string;

  @Column({ name: 'job_id', type: 'uuid' })
  jobId: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @Column({ name: 'candidate_cv_id', type: 'uuid', nullable: true })
  candidateCvId: string | null;

  @Column({ name: 'application_id', type: 'uuid', nullable: true })
  applicationId: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: MatchResultStatus,
    enumName: 'match_result_status_enum',
    default: MatchResultStatus.SUCCEEDED,
  })
  status: MatchResultStatus;

  @Column({
    name: 'provider',
    type: 'enum',
    enum: MatchProvider,
    enumName: 'match_provider_enum',
    default: MatchProvider.INTERNAL,
  })
  provider: MatchProvider;

  @Column({ name: 'model_version', type: 'varchar', length: 80, nullable: true })
  modelVersion: string | null;

  @Column({ name: 'total_score', type: 'double precision' })
  totalScore: number;

  @Column({ name: 'skill_score', type: 'double precision', default: 0 })
  skillScore: number;

  @Column({ name: 'experience_score', type: 'double precision', default: 0 })
  experienceScore: number;

  @Column({ name: 'education_score', type: 'double precision', default: 0 })
  educationScore: number;

  @Column({ name: 'certification_score', type: 'double precision', default: 0 })
  certificationScore: number;

  @Column({ name: 'project_score', type: 'double precision', default: 0 })
  projectScore: number;

  @Column({ name: 'preference_score', type: 'double precision', default: 0 })
  preferenceScore: number;

  @Column({ name: 'semantic_score', type: 'double precision', default: 0 })
  semanticScore: number;

  @Column({ name: 'explanation', type: 'jsonb' })
  explanation: MatchExplanation;

  @Column({ name: 'error_code', type: 'varchar', length: 120, nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
