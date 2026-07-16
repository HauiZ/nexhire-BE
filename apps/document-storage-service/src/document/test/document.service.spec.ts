import { BadRequestException } from '@nestjs/common';
import { ERROR_CODES } from '@nexhire/shared';
import { StorageService } from '@nexhire/infra';
import { Repository } from 'typeorm';
import { DocumentService } from '../document.service';
import { DocumentOwnerType, DocumentType } from '../entities/document.enum';
import { Document } from '../entities/document.entity';
import { UploadedDocumentFile } from '../interfaces/uploaded-document-file.interface';

type MockStorageService = {
  put: jest.Mock;
  presignedGetUrl: jest.Mock;
  remove: jest.Mock;
};

type MockRepo = {
  create: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
};

function createStorageMock(): MockStorageService {
  return {
    put: jest.fn().mockResolvedValue(undefined),
    presignedGetUrl: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

function createRepoMock(): MockRepo {
  return {
    create: jest.fn((entity: unknown) => entity),
    findOne: jest.fn(),
    save: jest.fn((entity: unknown) => entity),
  };
}

function createFile(overrides: Partial<UploadedDocumentFile> = {}): UploadedDocumentFile {
  return {
    originalname: 'candidate-cv.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('fake-pdf-content'),
    ...overrides,
  };
}

describe('DocumentService', () => {
  let service: DocumentService;
  let storageService: MockStorageService;
  let documentRepo: MockRepo;

  beforeEach(() => {
    storageService = createStorageMock();
    documentRepo = createRepoMock();
    storageService.presignedGetUrl.mockResolvedValue('https://storage.local/presigned-url');

    service = new DocumentService(
      storageService as unknown as StorageService,
      documentRepo as unknown as Repository<Document>,
    );
  });

  it('uploads a document, stores metadata, and returns a presigned URL', async () => {
    const dto = {
      documentType: DocumentType.CV,
      ownerType: DocumentOwnerType.CANDIDATE,
      ownerId: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5',
    };
    const file = createFile();

    const result = await service.upload(dto, file);

    expect(storageService.put).toHaveBeenCalledWith(
      expect.stringMatching(/^candidate\/b8b33c46-4bb0-4a33-8b0d-927e081a38a5\/cv\/.+\.pdf$/),
      file.buffer,
      file.size,
      file.mimetype,
    );
    expect(documentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: DocumentType.CV,
        ownerType: DocumentOwnerType.CANDIDATE,
        ownerId: dto.ownerId,
        fileName: 'candidate-cv.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        key: expect.stringMatching(
          /^candidate\/b8b33c46-4bb0-4a33-8b0d-927e081a38a5\/cv\/.+\.pdf$/,
        ),
      }),
    );
    expect(documentRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: result.id }));
    expect(storageService.presignedGetUrl).toHaveBeenCalledWith(result.key, 3600);
    expect(result).toEqual(
      expect.objectContaining({
        documentType: DocumentType.CV,
        ownerType: DocumentOwnerType.CANDIDATE,
        ownerId: dto.ownerId,
        fileName: 'candidate-cv.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        url: 'https://storage.local/presigned-url',
      }),
    );
  });

  it('rejects upload when file is missing', async () => {
    await expect(
      service.upload({
        documentType: DocumentType.CV,
        ownerType: DocumentOwnerType.CANDIDATE,
        ownerId: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.DOCUMENT.FILE_REQUIRED,
        message: 'File is required',
      }),
    });
    expect(storageService.put).not.toHaveBeenCalled();
    expect(documentRepo.save).not.toHaveBeenCalled();
  });

  it('rejects avatar upload when file type is not an image', async () => {
    await expect(
      service.upload(
        {
          documentType: DocumentType.AVATAR,
          ownerType: DocumentOwnerType.CANDIDATE,
          ownerId: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5',
        },
        createFile({ mimetype: 'application/pdf' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storageService.put).not.toHaveBeenCalled();
    expect(documentRepo.save).not.toHaveBeenCalled();
  });

  it('stores company logo uploads as image-only logo documents', async () => {
    await service.upload(
      {
        documentType: DocumentType.LOGO,
        ownerType: DocumentOwnerType.COMPANY,
        ownerId: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5',
      },
      createFile({ originalname: 'logo.png', mimetype: 'image/png' }),
    );

    expect(storageService.put).toHaveBeenCalledWith(
      expect.stringMatching(/^company\/b8b33c46-4bb0-4a33-8b0d-927e081a38a5\/logo\/.+\.png$/),
      expect.any(Buffer),
      expect.any(Number),
      'image/png',
    );
  });

  it('rejects logo upload when file type is not an image', async () => {
    await expect(
      service.upload(
        {
          documentType: DocumentType.LOGO,
          ownerType: DocumentOwnerType.COMPANY,
          ownerId: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5',
        },
        createFile({ mimetype: 'application/pdf' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storageService.put).not.toHaveBeenCalled();
    expect(documentRepo.save).not.toHaveBeenCalled();
  });

  it('removes uploaded object when metadata persistence fails', async () => {
    const error = new Error('db write failed');
    documentRepo.save.mockRejectedValue(error);

    await expect(
      service.upload(
        {
          documentType: DocumentType.CERTIFICATE,
          ownerType: DocumentOwnerType.CANDIDATE,
          ownerId: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5',
        },
        createFile({ originalname: 'certificate.png', mimetype: 'image/png' }),
      ),
    ).rejects.toThrow(error);

    expect(storageService.put).toHaveBeenCalled();
    expect(storageService.remove).toHaveBeenCalledWith(
      expect.stringMatching(
        /^candidate\/b8b33c46-4bb0-4a33-8b0d-927e081a38a5\/certificate\/.+\.png$/,
      ),
    );
    expect(storageService.presignedGetUrl).toHaveBeenCalled();
  });

  it('removes uploaded object when presigned URL generation fails', async () => {
    const error = new Error('presign failed');
    storageService.presignedGetUrl.mockRejectedValue(error);

    await expect(
      service.upload(
        {
          documentType: DocumentType.CV,
          ownerType: DocumentOwnerType.CANDIDATE,
          ownerId: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5',
        },
        createFile(),
      ),
    ).rejects.toThrow(error);

    expect(storageService.put).toHaveBeenCalled();
    expect(storageService.remove).toHaveBeenCalledWith(
      expect.stringMatching(/^candidate\/b8b33c46-4bb0-4a33-8b0d-927e081a38a5\/cv\/.+\.pdf$/),
    );
    expect(documentRepo.save).not.toHaveBeenCalled();
  });

  it('creates a download URL for an existing document', async () => {
    documentRepo.findOne.mockResolvedValue({
      id: 'document-1',
      documentType: DocumentType.CV,
      ownerType: DocumentOwnerType.CANDIDATE,
      ownerId: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5',
      fileName: 'candidate-cv.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      key: 'candidate/b8b33c46-4bb0-4a33-8b0d-927e081a38a5/cv/document-1.pdf',
    });

    const result = await service.createDownloadUrl('document-1');

    expect(documentRepo.findOne).toHaveBeenCalledWith({ where: { id: 'document-1' } });
    expect(storageService.presignedGetUrl).toHaveBeenCalledWith(
      'candidate/b8b33c46-4bb0-4a33-8b0d-927e081a38a5/cv/document-1.pdf',
      3600,
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'document-1',
        fileName: 'candidate-cv.pdf',
        url: 'https://storage.local/presigned-url',
        expiresInSeconds: 3600,
      }),
    );
  });

  it('returns not found when creating a download URL for a missing document', async () => {
    documentRepo.findOne.mockResolvedValue(null);

    await expect(service.createDownloadUrl('missing-document')).rejects.toMatchObject({
      status: 404,
    });
    expect(storageService.presignedGetUrl).not.toHaveBeenCalled();
  });
});
