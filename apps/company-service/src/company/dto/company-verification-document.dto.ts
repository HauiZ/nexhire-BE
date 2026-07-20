import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { CompanyVerificationDocumentType } from '../entities/company-verification-document.entity';

export class AttachCompanyVerificationDocumentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  documentId: string;

  @ApiProperty({ enum: CompanyVerificationDocumentType })
  @IsEnum(CompanyVerificationDocumentType)
  type: CompanyVerificationDocumentType;
}

export class CompanyVerificationDocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  companyId: string;

  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty({ enum: CompanyVerificationDocumentType })
  type: CompanyVerificationDocumentType;

  @ApiProperty({ format: 'uuid' })
  uploadedByUserId: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class CompanyVerificationDocumentWithMetadataResponseDto extends CompanyVerificationDocumentResponseDto {
  @ApiProperty({ example: 'CERTIFICATE' })
  documentType: string;

  @ApiProperty({ example: 'business-license.pdf' })
  fileName: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 234567 })
  size: number;
}

export class CompanyVerificationDocumentDownloadResponseDto extends CompanyVerificationDocumentWithMetadataResponseDto {
  @ApiProperty({ example: 'https://minio.local/nexhire/company-proof-url' })
  url: string;

  @ApiProperty({ example: 3600 })
  expiresInSeconds: number;
}

export class DeleteCompanyVerificationDocumentResponseDto {
  @ApiProperty({ example: true })
  deleted: true;
}
