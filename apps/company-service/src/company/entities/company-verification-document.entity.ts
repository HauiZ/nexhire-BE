import {
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';

export enum CompanyVerificationDocumentType {
  BUSINESS_LICENSE = 'BUSINESS_LICENSE',
  TAX_CERTIFICATE = 'TAX_CERTIFICATE',
  DOMAIN_PROOF = 'DOMAIN_PROOF',
  OTHER = 'OTHER',
}

@Entity({ name: 'company_verification_documents' })
@Index('idx_company_verification_documents_company_created_at', ['companyId', 'createdAt'])
@Index('uq_company_verification_documents_company_document', ['companyId', 'documentId'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class CompanyVerificationDocument {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_company_verification_documents_id',
  })
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({
    type: 'enum',
    enum: CompanyVerificationDocumentType,
    enumName: 'company_verification_document_type_enum',
  })
  type: CompanyVerificationDocumentType;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid' })
  uploadedByUserId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
