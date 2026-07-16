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

import { CandidateCvParseStatus } from './candidate.enum';
import { CandidateProfile } from './candidate-profile.entity';

@Entity('candidate_cvs')
@Index('uq_candidate_cvs_candidate_document', ['candidateId', 'documentId'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('uq_candidate_cvs_candidate_default', ['candidateId'], {
  unique: true,
  where: '"is_default" = true AND "deleted_at" IS NULL',
})
export class CandidateCv {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_candidate_cvs_id',
  })
  id: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => CandidateProfile, (candidate) => candidate.cvs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'candidate_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_candidate_cvs_candidate_id',
  })
  candidate: CandidateProfile;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ name: 'title', type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({
    name: 'parse_status',
    type: 'enum',
    enum: CandidateCvParseStatus,
    enumName: 'candidate_cv_parse_status_enum',
    default: CandidateCvParseStatus.NOT_PARSED,
  })
  parseStatus: CandidateCvParseStatus;

  @Column({ name: 'parsed_at', type: 'timestamptz', nullable: true })
  parsedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'document_deleted_at', type: 'timestamptz', nullable: true })
  documentDeletedAt: Date | null;

  @Column({ name: 'document_delete_error', type: 'text', nullable: true })
  documentDeleteError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
