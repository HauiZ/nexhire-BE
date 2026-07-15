import { ApiProperty } from '@nestjs/swagger';
import { DocumentOwnerType, DocumentType } from '../entities/document.enum';

export class DocumentDownloadResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: DocumentType })
  documentType: DocumentType;

  @ApiProperty({ enum: DocumentOwnerType })
  ownerType: DocumentOwnerType;

  @ApiProperty()
  ownerId: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  size: number;

  @ApiProperty()
  url: string;

  @ApiProperty()
  expiresInSeconds: number;
}
