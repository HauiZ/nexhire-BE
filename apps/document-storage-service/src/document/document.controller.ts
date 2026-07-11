import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, ApiSuccessResponse } from '@nexhire/shared';
import { DocumentService } from './document.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UploadDocumentResponseDto } from './dto/upload-document-response.dto';
import { DocumentOwnerType, DocumentType } from './entities/document.enum';
import { UploadedDocumentFile } from './interfaces/uploaded-document-file.interface';
import { DOCUMENT_MAX_UPLOAD_SIZE_BYTES } from './document.constants';

@ApiTags('documents')
@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: DOCUMENT_MAX_UPLOAD_SIZE_BYTES,
      },
    }),
  )
  @ApiOperation({ summary: 'Upload a recruitment document to object storage' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'documentType', 'ownerType', 'ownerId'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        documentType: {
          type: 'string',
          enum: Object.values(DocumentType),
          example: DocumentType.CV,
        },
        ownerType: {
          type: 'string',
          enum: Object.values(DocumentOwnerType),
          example: DocumentOwnerType.CANDIDATE,
        },
        ownerId: {
          type: 'string',
          format: 'uuid',
          example: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5',
        },
      },
    },
  })
  @ApiSuccessResponse(UploadDocumentResponseDto, { status: 201 })
  @ApiErrorResponses({ statuses: [400, 401, 403, 422, 500] })
  upload(
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file?: UploadedDocumentFile,
  ): Promise<UploadDocumentResponseDto> {
    return this.documentService.upload(dto, file);
  }
}
