import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

import { CvParseContext, CvParseProvider } from '../../cv-parsing/entities/cv-parsing.enum';

@Entity('ai_usage_logs')
@Index('idx_ai_usage_logs_parse_request_id', ['parseRequestId'])
@Index('idx_ai_usage_logs_provider_model', ['provider', 'model'])
@Index('idx_ai_usage_logs_created_at', ['createdAt'])
export class AiUsageLog {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_ai_usage_logs_id',
  })
  id: string;

  @Column({ name: 'parse_request_id', type: 'uuid' })
  parseRequestId: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @Column({ name: 'candidate_cv_id', type: 'uuid', nullable: true })
  candidateCvId: string | null;

  @Column({
    name: 'context',
    type: 'enum',
    enum: CvParseContext,
    enumName: 'cv_parse_context_enum',
  })
  context: CvParseContext;

  @Column({
    name: 'provider',
    type: 'enum',
    enum: CvParseProvider,
    enumName: 'cv_parse_provider_enum',
  })
  provider: CvParseProvider;

  @Column({ name: 'model', type: 'varchar', length: 120 })
  model: string;

  @Column({ name: 'operation', type: 'varchar', length: 80, default: 'CV_PARSE' })
  operation: string;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status: string;

  @Column({ name: 'latency_ms', type: 'integer', nullable: true })
  latencyMs: number | null;

  @Column({ name: 'input_tokens', type: 'integer', nullable: true })
  inputTokens: number | null;

  @Column({ name: 'output_tokens', type: 'integer', nullable: true })
  outputTokens: number | null;

  @Column({ name: 'total_tokens', type: 'integer', nullable: true })
  totalTokens: number | null;

  @Column({ name: 'estimated_cost_usd', type: 'numeric', precision: 12, scale: 6, nullable: true })
  estimatedCostUsd: string | null;

  @Column({ name: 'error_code', type: 'varchar', length: 120, nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
