import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';

import type { ParsedResume } from '@nexhire/shared';

import { CvParseRequest } from './cv-parse-request.entity';
import { CvParseProvider } from './cv-parsing.enum';

@Entity('cv_parse_results')
@Index('uq_cv_parse_results_parse_request_id', ['parseRequestId'], { unique: true })
@Index('idx_cv_parse_results_candidate_cv_id', ['candidateCvId'])
export class CvParseResult {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_cv_parse_results_id',
  })
  id: string;

  @Column({ name: 'parse_request_id', type: 'uuid' })
  parseRequestId: string;

  @OneToOne(() => CvParseRequest, (request) => request.result, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'parse_request_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_cv_parse_results_parse_request_id',
  })
  request: CvParseRequest;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @Column({ name: 'candidate_cv_id', type: 'uuid' })
  candidateCvId: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({
    name: 'provider',
    type: 'enum',
    enum: CvParseProvider,
    enumName: 'cv_parse_provider_enum',
    default: CvParseProvider.SKIMA,
  })
  provider: CvParseProvider;

  @Column({ name: 'provider_version', type: 'varchar', length: 80, nullable: true })
  providerVersion: string | null;

  @Column({ name: 'normalized_payload', type: 'jsonb' })
  normalizedPayload: ParsedResume;

  @Column({ name: 'raw_provider_payload', type: 'jsonb', nullable: true })
  rawProviderPayload: Record<string, unknown> | null;

  @Column({ name: 'confidence', type: 'jsonb', nullable: true })
  confidence: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
