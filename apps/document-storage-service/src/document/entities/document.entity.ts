import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentOwnerType, DocumentType } from './document.enum';

@Entity('documents')
@Index('idx_documents_owner_type_owner_id_document_type', [
  'ownerType',
  'ownerId',
  'documentType',
])
@Index('idx_documents_key', ['key'], { unique: true })
export class Document {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_documents_id',
  })
  id: string;

  @Column({
    name: 'document_type',
    type: 'enum',
    enum: DocumentType,
    enumName: 'document_type_enum',
  })
  documentType: DocumentType;

  @Column({
    name: 'owner_type',
    type: 'enum',
    enum: DocumentOwnerType,
    enumName: 'document_owner_type_enum',
  })
  ownerType: DocumentOwnerType;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 150 })
  mimeType: string;

  @Column({ name: 'size', type: 'integer' })
  size: number;

  @Column({ name: 'key', type: 'text' })
  key: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
