import {
  JobExperienceLevel,
  JobModerationDecision,
  JobModerationRiskLevel,
  JobRevisionStatus,
  JobType,
  JobWorkingType,
} from '@nexhire/shared';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Job } from './job.entity';

@Entity('job_revisions')
@Index('idx_job_revisions_job_status', ['jobId', 'status'])
export class JobRevision {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_job_revisions_id',
  })
  id: string;

  @Column({ name: 'job_id', type: 'uuid' })
  jobId: string;

  @ManyToOne(() => Job, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'job_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_job_revisions_job_id',
  })
  job: Job;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: JobRevisionStatus,
    enumName: 'job_revision_status_enum',
    default: JobRevisionStatus.DRAFT,
  })
  status: JobRevisionStatus;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'requirements', type: 'text', nullable: true })
  requirements: string | null;

  @Column({ name: 'skills', type: 'text', array: true, default: () => "'{}'" })
  skills: string[];

  @Column({ name: 'benefits', type: 'text', nullable: true })
  benefits: string | null;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @Column({
    name: 'employment_type',
    type: 'enum',
    enum: JobType,
    enumName: 'job_employment_type_enum',
    nullable: true,
  })
  employmentType: JobType | null;

  @Column({
    name: 'working_type',
    type: 'enum',
    enum: JobWorkingType,
    enumName: 'job_working_type_enum',
    nullable: true,
  })
  workingType: JobWorkingType | null;

  @Column({
    name: 'experience_level',
    type: 'enum',
    enum: JobExperienceLevel,
    enumName: 'job_experience_level_enum',
    nullable: true,
  })
  experienceLevel: JobExperienceLevel | null;

  @Column({ name: 'location', type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ name: 'salary_min', type: 'integer', nullable: true })
  salaryMin: number | null;

  @Column({ name: 'salary_max', type: 'integer', nullable: true })
  salaryMax: number | null;

  @Column({ name: 'salary_currency', type: 'varchar', length: 3, default: 'VND' })
  salaryCurrency: string;

  @Column({ name: 'is_salary_visible', type: 'boolean', default: true })
  isSalaryVisible: boolean;

  @Column({ name: 'deadline', type: 'timestamptz', nullable: true })
  deadline: Date | null;

  @Column({ name: 'number_of_openings', type: 'integer', nullable: true })
  numberOfOpenings: number | null;

  @Column({ name: 'change_summary', type: 'text', nullable: true })
  changeSummary: string | null;

  @Column({ name: 'risk_score', type: 'integer', nullable: true })
  riskScore: number | null;

  @Column({
    name: 'risk_level',
    type: 'enum',
    enum: JobModerationRiskLevel,
    enumName: 'job_moderation_risk_level_enum',
    nullable: true,
  })
  riskLevel: JobModerationRiskLevel | null;

  @Column({
    name: 'moderation_decision',
    type: 'enum',
    enum: JobModerationDecision,
    enumName: 'job_moderation_decision_enum',
    nullable: true,
  })
  moderationDecision: JobModerationDecision | null;

  @Column({ name: 'moderation_reasons', type: 'text', array: true, default: () => "'{}'" })
  moderationReasons: string[];

  @Column({ name: 'moderation_matched_rules', type: 'text', array: true, default: () => "'{}'" })
  moderationMatchedRules: string[];

  @Column({ name: 'moderation_policy_id', type: 'uuid', nullable: true })
  moderationPolicyId: string | null;

  @Column({ name: 'moderation_policy_version', type: 'integer', nullable: true })
  moderationPolicyVersion: number | null;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_reason', type: 'text', nullable: true })
  reviewReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
