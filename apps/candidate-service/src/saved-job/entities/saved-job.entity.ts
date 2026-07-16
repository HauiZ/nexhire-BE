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
import { JobExperienceLevel, JobStatus } from '@nexhire/shared';
import { CandidateProfile } from '../../candidate/entities/candidate-profile.entity';

@Entity('saved_jobs')
@Index('uq_saved_jobs_candidate_job', ['candidateId', 'jobId'], { unique: true })
@Index('idx_saved_jobs_candidate_created_at', ['candidateId', 'createdAt'])
@Index('idx_saved_jobs_candidate_user_created_at', ['candidateUserId', 'createdAt'])
@Index('idx_saved_jobs_candidate_user_job', ['candidateUserId', 'jobId'])
export class SavedJob {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_saved_jobs_id',
  })
  id: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => CandidateProfile, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'candidate_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_saved_jobs_candidate_id',
  })
  candidate: CandidateProfile;

  @Column({ name: 'candidate_user_id', type: 'uuid' })
  candidateUserId: string;

  @Column({ name: 'job_id', type: 'uuid' })
  jobId: string;

  @Column({ name: 'job_title', type: 'varchar', length: 255 })
  jobTitle: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'company_name', type: 'varchar', length: 255, nullable: true })
  companyName: string | null;

  @Column({ name: 'company_logo_url', type: 'text', nullable: true })
  companyLogoUrl: string | null;

  @Column({
    name: 'job_status',
    type: 'enum',
    enum: JobStatus,
    enumName: 'saved_job_status_enum',
  })
  jobStatus: JobStatus;

  @Column({
    name: 'experience_level',
    type: 'enum',
    enum: JobExperienceLevel,
    enumName: 'saved_job_experience_level_enum',
  })
  experienceLevel: JobExperienceLevel;

  @Column({ name: 'location', type: 'varchar', length: 255 })
  location: string;

  @Column({ name: 'salary_min', type: 'integer', nullable: true })
  salaryMin: number | null;

  @Column({ name: 'salary_max', type: 'integer', nullable: true })
  salaryMax: number | null;

  @Column({ name: 'salary_currency', type: 'varchar', length: 10 })
  salaryCurrency: string;

  @Column({ name: 'is_salary_visible', type: 'boolean' })
  isSalaryVisible: boolean;

  @Column({ name: 'deadline', type: 'timestamptz', nullable: true })
  deadline: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
