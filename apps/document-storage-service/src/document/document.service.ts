import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ERROR_CODES } from '@nexhire/shared';
import { StorageService } from '@nexhire/infra';
import { extname } from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentDownloadResponseDto } from './dto/document-download-response.dto';
import { UploadDocumentResponseDto } from './dto/upload-document-response.dto';
import { DocumentType } from './entities/document.enum';
import { Document } from './entities/document.entity';
import { UploadedDocumentFile } from './interfaces/uploaded-document-file.interface';
import { DOCUMENT_MAX_UPLOAD_SIZE_BYTES } from './document.constants';

@Injectable()
export class DocumentService {
  private readonly downloadUrlTtlSeconds = 3600;

  constructor(
    private readonly storageService: StorageService,
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
  ) {}

  async upload(
    dto: UploadDocumentDto,
    file?: UploadedDocumentFile,
  ): Promise<UploadDocumentResponseDto> {
    if (!file) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_REQUIRED,
        message: 'File is required',
      });
    }

    this.validateFile(dto.documentType, file);

    const id = randomUUID();
    const extension = this.resolveExtension(file);
    const key = [
      dto.ownerType,
      dto.ownerId,
      dto.documentType.toLowerCase(),
      `${id}${extension}`,
    ].join('/');

    await this.storageService.put(key, file.buffer, file.size, file.mimetype);
    const url = await this.getDownloadUrlOrRemoveObject(key);
    const document = await this.saveMetadataOrRemoveObject(dto, file, id, key);

    return {
      id: document.id,
      documentType: document.documentType,
      ownerType: document.ownerType,
      ownerId: document.ownerId,
      fileName: document.fileName,
      mimeType: document.mimeType,
      size: document.size,
      key: document.key,
      url,
    };
  }

  async createDownloadUrl(id: string): Promise<DocumentDownloadResponseDto> {
    const document = await this.documentRepo.findOne({ where: { id } });
    if (!document) {
      throw new NotFoundException({
        code: ERROR_CODES.COMMON.NOT_FOUND,
        message: 'Document not found',
      });
    }

    return {
      id: document.id,
      documentType: document.documentType,
      ownerType: document.ownerType,
      ownerId: document.ownerId,
      fileName: document.fileName,
      mimeType: document.mimeType,
      size: document.size,
      url: await this.storageService.presignedGetUrl(document.key, this.downloadUrlTtlSeconds),
      expiresInSeconds: this.downloadUrlTtlSeconds,
    };
  }

  private async saveMetadataOrRemoveObject(
    dto: UploadDocumentDto,
    file: UploadedDocumentFile,
    id: string,
    key: string,
  ): Promise<Document> {
    try {
      return await this.documentRepo.save(
        this.documentRepo.create({
          id,
          documentType: dto.documentType,
          ownerType: dto.ownerType,
          ownerId: dto.ownerId,
          fileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          key,
        }),
      );
    } catch (error) {
      await this.storageService.remove(key).catch(() => undefined);
      throw error;
    }
  }

  private async getDownloadUrlOrRemoveObject(key: string): Promise<string> {
    try {
      return await this.storageService.presignedGetUrl(key, this.downloadUrlTtlSeconds);
    } catch (error) {
      await this.storageService.remove(key).catch(() => undefined);
      throw error;
    }
  }

  private validateFile(documentType: DocumentType, file: UploadedDocumentFile): void {
    if (file.size > DOCUMENT_MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_TOO_LARGE,
        message: 'File size must not exceed 10MB',
      });
    }

    const allowedMimeTypes = this.getAllowedMimeTypes(documentType);
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.UNSUPPORTED_FILE_TYPE,
        message: `File type ${file.mimetype} is not allowed for ${documentType}`,
      });
    }
  }

  private getAllowedMimeTypes(documentType: DocumentType): string[] {
    const imageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const documentMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (documentType === DocumentType.AVATAR) {
      return imageMimeTypes;
    }

    if (documentType === DocumentType.CV || documentType === DocumentType.CERTIFICATE) {
      return [...documentMimeTypes, ...imageMimeTypes];
    }

    return [...documentMimeTypes, ...imageMimeTypes];
  }

  private resolveExtension(file: UploadedDocumentFile): string {
    const originalExtension = extname(file.originalname);
    if (originalExtension) {
      return originalExtension.toLowerCase();
    }

    const mimeExtensionMap: Record<string, string> = {
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };

    return mimeExtensionMap[file.mimetype] ?? '';
  }
}
