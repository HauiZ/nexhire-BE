import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApplicationStage } from '@nexhire/shared';

export enum ApplicationMatchLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  EXCELLENT = 'EXCELLENT',
}

@Entity('applications')
@Index('idx_applications_candidate_user_created_at', ['candidateUserId', 'createdAt'])
@Index('idx_applications_company_status_created_at', ['companyId', 'status', 'createdAt'])
@Index('idx_applications_job_status', ['jobId', 'status'])
export class Application {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_applications_id',
  })
  id: string;

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

  @Column({ name: 'company_logo_document_id', type: 'uuid', nullable: true })
  companyLogoDocumentId: string | null;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @Column({ name: 'candidate_user_id', type: 'uuid' })
  candidateUserId: string;

  @Column({ name: 'candidate_full_name', type: 'varchar', length: 255, nullable: true })
  candidateFullName: string | null;

  @Column({ name: 'candidate_email', type: 'varchar', length: 255, nullable: true })
  candidateEmail: string | null;

  @Column({ name: 'candidate_phone', type: 'varchar', length: 30, nullable: true })
  candidatePhone: string | null;

  @Column({ name: 'candidate_avatar_document_id', type: 'uuid', nullable: true })
  candidateAvatarDocumentId: string | null;

  @Column({ name: 'candidate_cv_id', type: 'uuid' })
  candidateCvId: string;

  @Column({ name: 'cv_document_id', type: 'uuid' })
  cvDocumentId: string;

  @Column({ name: 'cv_title', type: 'varchar', length: 255, nullable: true })
  cvTitle: string | null;

  @Column({ name: 'cv_file_name', type: 'varchar', length: 255 })
  cvFileName: string;

  @Column({ name: 'cv_mime_type', type: 'varchar', length: 150 })
  cvMimeType: string;

  @Column({ name: 'cv_size', type: 'integer' })
  cvSize: number;

  @Column({ name: 'cv_parse_status', type: 'varchar', length: 30 })
  cvParseStatus: string;

  @Column({ name: 'cover_letter', type: 'text', nullable: true })
  coverLetter: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ApplicationStage,
    enumName: 'application_status_enum',
    default: ApplicationStage.SUBMITTED,
  })
  status: ApplicationStage;

  @Column({ name: 'status_note', type: 'text', nullable: true })
  statusNote: string | null;

  @Column({ name: 'match_score', type: 'double precision', nullable: true })
  matchScore: number | null;

  @Column({ name: 'match_level', type: 'varchar', length: 20, nullable: true })
  matchLevel: ApplicationMatchLevel | null;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt: Date;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt: Date | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
