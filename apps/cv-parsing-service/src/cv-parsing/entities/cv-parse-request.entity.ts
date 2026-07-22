import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { CvParseContext, CvParseProvider, CvParseRequestStatus } from './cv-parsing.enum';
import { CvParseResult } from './cv-parse-result.entity';

@Entity('cv_parse_requests')
@Index('idx_cv_parse_requests_candidate_id', ['candidateId'])
@Index('idx_cv_parse_requests_candidate_cv_id', ['candidateCvId'])
@Index('idx_cv_parse_requests_document_id', ['documentId'])
export class CvParseRequest {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_cv_parse_requests_id',
  })
  id: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId: string;

  @Column({ name: 'candidate_cv_id', type: 'uuid' })
  candidateCvId: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ name: 'document_url', type: 'text', nullable: true })
  documentUrl: string | null;

  @Column({
    name: 'context',
    type: 'enum',
    enum: CvParseContext,
    enumName: 'cv_parse_context_enum',
    default: CvParseContext.PROFILE_UPDATE,
  })
  context: CvParseContext;

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
    default: CvParseProvider.GEMINI,
  })
  provider: CvParseProvider;

  @Column({ name: 'provider_version', type: 'varchar', length: 80, nullable: true })
  providerVersion: string | null;

  @Column({ name: 'content_hash', type: 'varchar', length: 128, nullable: true })
  contentHash: string | null;

  @Column({ name: 'error_code', type: 'varchar', length: 120, nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => CvParseResult, (result) => result.request)
  result: CvParseResult;
}
