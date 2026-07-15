import {
  JobExperienceLevel,
  JobModerationDecision,
  JobModerationRiskLevel,
  JobStatus,
  JobType,
  JobWorkingType,
} from '@nexhire/shared';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { CompanyStatusSnapshot, CompanyTrustLevel } from './job.enum';

@Entity('jobs')
@Index('idx_jobs_public_status_created_at', ['status', 'createdAt'])
@Index('idx_jobs_company_status', ['companyId', 'status'])
@Index('idx_jobs_category_id', ['categoryId'])
export class Job {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_jobs_id',
  })
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'company_name', type: 'varchar', length: 255, nullable: true })
  companyName: string | null;

  @Column({
    name: 'company_status',
    type: 'enum',
    enum: CompanyStatusSnapshot,
    enumName: 'company_status_snapshot_enum',
  })
  companyStatus: CompanyStatusSnapshot;

  @Column({
    name: 'company_trust_level',
    type: 'enum',
    enum: CompanyTrustLevel,
    enumName: 'company_trust_level_enum',
    default: CompanyTrustLevel.MEDIUM,
  })
  companyTrustLevel: CompanyTrustLevel;

  @Column({ name: 'company_snapshot_at', type: 'timestamptz' })
  companySnapshotAt: Date;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'description', type: 'text' })
  description: string;

  @Column({ name: 'requirements', type: 'text' })
  requirements: string;

  @Column({ name: 'benefits', type: 'text', nullable: true })
  benefits: string | null;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @Column({
    name: 'employment_type',
    type: 'enum',
    enum: JobType,
    enumName: 'job_employment_type_enum',
  })
  employmentType: JobType;

  @Column({
    name: 'working_type',
    type: 'enum',
    enum: JobWorkingType,
    enumName: 'job_working_type_enum',
  })
  workingType: JobWorkingType;

  @Column({
    name: 'experience_level',
    type: 'enum',
    enum: JobExperienceLevel,
    enumName: 'job_experience_level_enum',
  })
  experienceLevel: JobExperienceLevel;

  @Column({ name: 'location', type: 'varchar', length: 255 })
  location: string;

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

  @Column({
    name: 'status',
    type: 'enum',
    enum: JobStatus,
    enumName: 'job_status_enum',
    default: JobStatus.DRAFT,
  })
  status: JobStatus;

  @Column({ name: 'version', type: 'integer', default: 1 })
  version: number;

  @Column({ name: 'application_count', type: 'integer', default: 0 })
  applicationCount: number;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

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
}
