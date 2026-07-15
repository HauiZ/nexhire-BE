import { JobModerationDecision, JobModerationRiskLevel, JobReviewDecision } from '@nexhire/shared';
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { JobModerationTargetType } from './job.enum';

@Entity('job_moderation_reviews')
@Index('idx_job_moderation_reviews_job_created_at', ['jobId', 'createdAt'])
@Index('idx_job_moderation_reviews_target', ['targetType', 'targetId'])
export class JobModerationReview {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_job_moderation_reviews_id',
  })
  id: string;

  @Column({ name: 'job_id', type: 'uuid' })
  jobId: string;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: JobModerationTargetType,
    enumName: 'job_moderation_target_type_enum',
  })
  targetType: JobModerationTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({ name: 'risk_score', type: 'integer' })
  riskScore: number;

  @Column({
    name: 'risk_level',
    type: 'enum',
    enum: JobModerationRiskLevel,
    enumName: 'job_moderation_risk_level_enum',
  })
  riskLevel: JobModerationRiskLevel;

  @Column({
    name: 'decision',
    type: 'enum',
    enum: JobModerationDecision,
    enumName: 'job_moderation_decision_enum',
  })
  decision: JobModerationDecision;

  @Column({ name: 'reasons', type: 'text', array: true })
  reasons: string[];

  @Column({ name: 'matched_rules', type: 'text', array: true })
  matchedRules: string[];

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({
    name: 'admin_decision',
    type: 'enum',
    enum: JobReviewDecision,
    enumName: 'job_review_decision_enum',
    nullable: true,
  })
  adminDecision: JobReviewDecision | null;

  @Column({ name: 'admin_reason', type: 'text', nullable: true })
  adminReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
