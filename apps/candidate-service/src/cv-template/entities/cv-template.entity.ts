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

import { CandidateProfile } from '../../candidate/entities/candidate-profile.entity';
import { CvTemplateKey } from '../../candidate/entities/candidate.enum';

@Entity('candidate_cv_templates')
@Index('idx_candidate_cv_templates_candidate_id', ['candidateId'])
@Index('idx_candidate_cv_templates_source_document_id', ['sourceDocumentId'])
@Index('uq_candidate_cv_templates_candidate_default', ['candidateId'], {
  unique: true,
  where: '"is_default" = true AND "deleted_at" IS NULL',
})
export class CandidateCvTemplate {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_candidate_cv_templates_id',
  })
  id: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => CandidateProfile, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'candidate_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_candidate_cv_templates_candidate_id',
  })
  candidate: CandidateProfile;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({
    name: 'template_key',
    type: 'enum',
    enum: CvTemplateKey,
    enumName: 'cv_template_key_enum',
  })
  templateKey: CvTemplateKey;

  @Column({ name: 'source_document_id', type: 'uuid', nullable: true })
  sourceDocumentId: string | null;

  @Column({ name: 'source_document_deleted_at', type: 'timestamptz', nullable: true })
  sourceDocumentDeletedAt: Date | null;

  @Column({ name: 'source_cv_id', type: 'uuid', nullable: true })
  sourceCvId: string | null;

  @Column({ name: 'source_parse_request_id', type: 'uuid', nullable: true })
  sourceParseRequestId: string | null;

  @Column({ name: 'theme', type: 'jsonb', default: () => "'{}'" })
  theme: Record<string, unknown>;

  @Column({ name: 'layout', type: 'jsonb', default: () => "'{}'" })
  layout: Record<string, unknown>;

  @Column({ name: 'content_snapshot', type: 'jsonb', default: () => "'{}'" })
  contentSnapshot: Record<string, unknown>;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'last_exported_cv_id', type: 'uuid', nullable: true })
  lastExportedCvId: string | null;

  @Column({ name: 'last_exported_at', type: 'timestamptz', nullable: true })
  lastExportedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
