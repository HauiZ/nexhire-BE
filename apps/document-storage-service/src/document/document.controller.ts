import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, ApiSuccessResponse, InternalServiceTokenGuard } from '@nexhire/shared';
import { DocumentService } from './document.service';
import { DocumentDownloadResponseDto } from './dto/document-download-response.dto';
import { DocumentMetadataResponseDto } from './dto/document-metadata-response.dto';
import { DeleteDocumentResponseDto } from './dto/delete-document-response.dto';
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

@ApiTags('internal-documents')
@Controller('internal/documents')
@UseGuards(InternalServiceTokenGuard)
export class DocumentInternalController {
  constructor(private readonly documentService: DocumentService) {}

  @Get(':id/download-url')
  @ApiOperation({ summary: 'Create a short-lived download URL for an internal caller' })
  @ApiSuccessResponse(DocumentDownloadResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  getInternalDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentDownloadResponseDto> {
    return this.documentService.createDownloadUrl(id);
  }

  @Get(':id/metadata')
  @ApiOperation({ summary: 'Get document metadata for an internal caller' })
  @ApiSuccessResponse(DocumentMetadataResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  getInternalMetadata(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentMetadataResponseDto> {
    return this.documentService.getMetadata(id);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Physically remove a document object and soft-delete metadata' })
  @ApiSuccessResponse(DeleteDocumentResponseDto)
  @ApiErrorResponses({ statuses: [401, 403, 404, 500] })
  deleteInternalDocument(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeleteDocumentResponseDto> {
    return this.documentService.deleteDocument(id);
  }
}
