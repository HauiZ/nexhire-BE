import { ApiProperty } from '@nestjs/swagger';
import { DocumentOwnerType, DocumentType } from '../entities/document.enum';

export class UploadDocumentResponseDto {
  @ApiProperty({ example: '6b5f02d0-5aa1-4e5e-a5f6-9880cb3303db' })
  id: string;

  @ApiProperty({ enum: DocumentType, example: DocumentType.CV })
  documentType: DocumentType;

  @ApiProperty({ enum: DocumentOwnerType, example: DocumentOwnerType.CANDIDATE })
  ownerType: DocumentOwnerType;

  @ApiProperty({ example: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5' })
  ownerId: string;

  @ApiProperty({ example: 'cv.pdf' })
  fileName: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 123456 })
  size: number;

  @ApiProperty({
    example: 'candidate/b8b33c46-4bb0-4a33-8b0d-927e081a38a5/cv/6b5f02d0.pdf',
  })
  key: string;

  @ApiProperty({ example: 'https://minio.local/nexhire/...' })
  url: string;
}
