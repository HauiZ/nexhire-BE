import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { JobExperienceLevel } from '@nexhire/shared';
import { CompanyTrustLevel } from './job.enum';

export enum JobModerationPolicyStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  UNPUBLISHED = 'UNPUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export interface JobModerationPolicyRules {
  thresholds: {
    medium: number;
    high: number;
    critical: number;
  };
  keywordRules: Array<{
    id: string;
    keyword: string;
    score: number;
    reason: string;
    enabled?: boolean;
  }>;
  contentRules: {
    minDescriptionLength: number;
    descriptionScore: number;
    minRequirementsLength: number;
    requirementsScore: number;
    missingLocationScore: number;
  };
  salaryRules: {
    maxByExperienceLevel: Record<JobExperienceLevel, { max: number; score: number }>;
  };
  linkRules: {
    shortenedDomains: string[];
    shortenedUrlScore: number;
    maxExternalLinks: number;
    tooManyExternalLinksScore: number;
    externalFormDomains: string[];
    externalFormScore: number;
  };
  spamRules: {
    allCapsTitleScore: number;
    maxTitleSymbols: number;
    excessiveSymbolsScore: number;
    repeatedWordThreshold: number;
    repeatedWordScore: number;
  };
  crossSignalRules: {
    upfrontPaymentSignals: string[];
    remoteUpfrontPaymentScore: number;
    internshipNoExperienceSalaryMax: number;
    internshipNoExperienceSalaryScore: number;
  };
  companyTrustRules: {
    lowTrustScore: number;
  };
}

@Entity('job_moderation_policies')
@Index('idx_job_moderation_policies_status', ['status'])
export class JobModerationPolicy {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_job_moderation_policies_id',
  })
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: JobModerationPolicyStatus,
    enumName: 'job_moderation_policy_status_enum',
    default: JobModerationPolicyStatus.DRAFT,
  })
  status: JobModerationPolicyStatus;

  @Column({ name: 'version', type: 'integer', default: 1 })
  version: number;

  @Column({ name: 'rules', type: 'jsonb' })
  rules: JobModerationPolicyRules;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
