import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { DocumentOwnerType, DocumentType } from '../entities/document.enum';

export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentType, example: DocumentType.CV })
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @ApiProperty({ enum: DocumentOwnerType, example: DocumentOwnerType.CANDIDATE })
  @IsEnum(DocumentOwnerType)
  ownerType: DocumentOwnerType;

  @ApiProperty({ example: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5' })
  @IsUUID()
  ownerId: string;
}
