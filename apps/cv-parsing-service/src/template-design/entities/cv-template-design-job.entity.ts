import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { ParsedResume } from '@nexhire/shared';

import { CvParseProvider, CvParseRequestStatus } from '../../cv-parsing/entities/cv-parsing.enum';
import { CanvasDocument, SanitizeReport } from '../canvas.types';

/**
 * Job admin tải CV mẫu lên để AI dựng thành CV template preset.
 *
 * Bảng riêng chứ không dùng cv_parse_requests: bảng đó có candidate_id NOT NULL,
 * còn job này không thuộc ứng viên nào. Nới NOT NULL trên bảng đang chạy
 * production chỉ để tiết kiệm cơ chế job là đánh đổi sai.
 *
 * Bất biến: status = SUCCEEDED <=> canvas và parsedResume đều khác null.
 */
@Entity('cv_template_design_jobs')
@Index('idx_cv_template_design_jobs_created_by', ['createdByUserId'])
@Index('idx_cv_template_design_jobs_status_created', ['status', 'createdAt'])
export class CvTemplateDesignJob {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_cv_template_design_jobs_id',
  })
  id: string;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ name: 'source_file_name', type: 'varchar', length: 255 })
  sourceFileName: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: CvParseRequestStatus,
    enumName: 'cv_parse_request_status_enum',
    default: CvParseRequestStatus.QUEUED,
  })
  status: CvParseRequestStatus;

  @Column({
    name: 'provider',
    type: 'enum',
    enum: CvParseProvider,
    enumName: 'cv_parse_provider_enum',
    default: CvParseProvider.OPENAI,
  })
  provider: CvParseProvider;

  /** Model id thực tế đã dùng (ví dụ 'gpt-4o'), không phải tên provider. */
  @Column({ name: 'provider_version', type: 'varchar', length: 80, nullable: true })
  providerVersion: string | null;

  @Column({ name: 'canvas', type: 'jsonb', nullable: true })
  canvas: CanvasDocument | null;

  @Column({ name: 'parsed_resume', type: 'jsonb', nullable: true })
  parsedResume: ParsedResume | null;

  @Column({ name: 'raw_provider_payload', type: 'jsonb', nullable: true })
  rawProviderPayload: Record<string, unknown> | null;

  @Column({ name: 'sanitize_report', type: 'jsonb', nullable: true })
  sanitizeReport: SanitizeReport | null;

  @Column({ name: 'error_code', type: 'varchar', length: 120, nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
