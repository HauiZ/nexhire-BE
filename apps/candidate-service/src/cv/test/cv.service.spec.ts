import { ConfigService } from '@nestjs/config';
import { ERROR_CODES, UserRole } from '@nexhire/shared';
import { DataSource, Repository } from 'typeorm';

import { ApplicationClientService } from '../../application-client/application-client.service';
import { CandidateService } from '../../candidate/candidate.service';
import { CandidateCv } from '../../candidate/entities/candidate-cv.entity';
import { CandidateCvParseStatus } from '../../candidate/entities/candidate.enum';
import { DocumentClientService } from '../../document-client/document-client.service';
import { CvService } from '../cv.service';
import { CvEventPublisher } from '../events/cv-event.publisher';

describe('CvService', () => {
  let service: CvService;
  let dataSource: { transaction: jest.Mock };
  let configService: { get: jest.Mock };
  let candidateService: { ensureProfileForUser: jest.Mock };
  let applicationClientService: { getCvDocumentRetention: jest.Mock };
  let cvEventPublisher: { publishCvUploaded: jest.Mock };
  let documentClientService: {
    createDownloadUrl: jest.Mock;
    deleteDocument: jest.Mock;
    uploadCandidateDocument: jest.Mock;
  };
  let cvRepo: {
    count: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        callback({
          getRepository: jest.fn(() => cvRepo),
        }),
      ),
    };
    configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'candidateService.cvCleanup.deletedGraceDays': 30,
          'candidateService.cvCleanup.terminalApplicationRetentionDays': 180,
          'candidateService.cvCleanup.batchSize': 50,
        };
        return values[key] ?? fallback;
      }),
    };
    candidateService = {
      ensureProfileForUser: jest.fn().mockResolvedValue({ id: 'candidate-1' }),
    };
    applicationClientService = {
      getCvDocumentRetention: jest.fn().mockResolvedValue({
        documentId: 'document-1',
        canDelete: true,
        activeApplicationCount: 0,
        recentTerminalApplicationCount: 0,
        blockingStatus: null,
      }),
    };
    cvEventPublisher = {
      publishCvUploaded: jest.fn().mockResolvedValue(undefined),
    };
    documentClientService = {
      createDownloadUrl: jest.fn().mockResolvedValue({
        url: 'https://storage.local/download/cv.pdf',
        expiresInSeconds: 900,
      }),
      deleteDocument: jest.fn().mockResolvedValue(undefined),
      uploadCandidateDocument: jest.fn().mockResolvedValue({
        id: 'document-1',
        url: 'https://storage.local/cv.pdf',
      }),
    };
    cvRepo = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((payload: CandidateCv) => payload),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn((payload: CandidateCv) =>
        Promise.resolve({
          ...payload,
          id: 'cv-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    service = new CvService(
      dataSource as unknown as DataSource,
      configService as unknown as ConfigService,
      candidateService as unknown as CandidateService,
      applicationClientService as unknown as ApplicationClientService,
      documentClientService as unknown as DocumentClientService,
      cvEventPublisher as unknown as CvEventPublisher,
      cvRepo as unknown as Repository<CandidateCv>,
    );
  });

  it('uploads a CV without parsing by default', async () => {
    const result = await service.uploadCv(
      { id: 'user-1', role: UserRole.CANDIDATE },
      {},
      {
        originalname: 'cv.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('cv'),
      },
    );

    expect(result.parseStatus).toBe(CandidateCvParseStatus.NOT_PARSED);
    expect(result.isDefault).toBe(false);
    expect(cvRepo.count).not.toHaveBeenCalled();
    expect(cvEventPublisher.publishCvUploaded).not.toHaveBeenCalled();
  });

  it('does not parse or mark default from upload, even when parse is requested', async () => {
    const result = await service.uploadCv(
      { id: 'user-1', role: UserRole.CANDIDATE },
      { parse: true },
      {
        originalname: 'cv.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('cv'),
      },
    );

    expect(result.parseStatus).toBe(CandidateCvParseStatus.NOT_PARSED);
    expect(result.isDefault).toBe(false);
    expect(documentClientService.createDownloadUrl).not.toHaveBeenCalled();
    expect(cvEventPublisher.publishCvUploaded).not.toHaveBeenCalled();
  });

  it('never marks a CV as default from upload, even when default is requested', async () => {
    const result = await service.uploadCv(
      { id: 'user-1', role: UserRole.CANDIDATE },
      { isDefault: true },
      {
        originalname: 'cv.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('cv'),
      },
    );

    expect(result.isDefault).toBe(false);
    expect(result.parseStatus).toBe(CandidateCvParseStatus.NOT_PARSED);
    expect(cvRepo.update).not.toHaveBeenCalled();
    expect(cvEventPublisher.publishCvUploaded).not.toHaveBeenCalled();
  });

  it('triggers parsing for a saved CV', async () => {
    cvRepo.findOne.mockResolvedValueOnce({
      id: 'cv-1',
      candidateId: 'candidate-1',
      documentId: 'document-1',
      title: 'Main CV',
      isDefault: true,
      parseStatus: CandidateCvParseStatus.NOT_PARSED,
      parsedAt: null,
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    } as CandidateCv);

    const result = await service.parseMine({ id: 'user-1', role: UserRole.CANDIDATE }, 'cv-1');

    expect(cvRepo.update).toHaveBeenCalledWith('cv-1', {
      parseStatus: CandidateCvParseStatus.PARSING,
      parsedAt: null,
    });
    expect(cvEventPublisher.publishCvUploaded).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        candidateUserId: 'user-1',
        candidateCvId: 'cv-1',
        documentId: 'document-1',
        documentUrl: 'https://storage.local/download/cv.pdf',
      }),
    );
    expect(result.parseStatus).toBe(CandidateCvParseStatus.PARSING);
  });

  it('forces parsing for a saved CV that is already marked parsed', async () => {
    cvRepo.findOne.mockResolvedValueOnce({
      id: 'cv-1',
      candidateId: 'candidate-1',
      documentId: 'document-1',
      title: 'Main CV',
      isDefault: true,
      parseStatus: CandidateCvParseStatus.PARSED,
      parsedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    } as CandidateCv);

    const result = await service.requestParseForMatching('candidate-1', 'cv-1', 'user-1', true);

    expect(cvRepo.update).toHaveBeenCalledWith(
      {
        id: 'cv-1',
        candidateId: 'candidate-1',
        deletedAt: expect.any(Object),
        parseStatus: expect.any(Object),
      },
      {
        parseStatus: CandidateCvParseStatus.PARSING,
        parsedAt: null,
      },
    );
    expect(cvEventPublisher.publishCvUploaded).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        candidateUserId: 'user-1',
        candidateCvId: 'cv-1',
        documentId: 'document-1',
      }),
    );
    expect(result.parseStatus).toBe(CandidateCvParseStatus.PARSING);
  });

  it('does not publish duplicate parse events when another request already moved CV to parsing', async () => {
    cvRepo.findOne
      .mockResolvedValueOnce({
        id: 'cv-1',
        candidateId: 'candidate-1',
        documentId: 'document-1',
        title: 'Main CV',
        isDefault: true,
        parseStatus: CandidateCvParseStatus.NOT_PARSED,
        parsedAt: null,
        deletedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      } as CandidateCv)
      .mockResolvedValueOnce({
        id: 'cv-1',
        candidateId: 'candidate-1',
        documentId: 'document-1',
        title: 'Main CV',
        isDefault: true,
        parseStatus: CandidateCvParseStatus.PARSING,
        parsedAt: null,
        deletedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      } as CandidateCv);
    cvRepo.update.mockResolvedValueOnce({ affected: 0 });

    const result = await service.requestParseForMatching('candidate-1', 'cv-1', 'user-1');

    expect(result.parseStatus).toBe(CandidateCvParseStatus.PARSING);
    expect(cvEventPublisher.publishCvUploaded).not.toHaveBeenCalled();
  });

  it('rejects parsing a CV that is already being parsed', async () => {
    cvRepo.findOne.mockResolvedValueOnce({
      id: 'cv-1',
      candidateId: 'candidate-1',
      documentId: 'document-1',
      parseStatus: CandidateCvParseStatus.PARSING,
      deletedAt: null,
    } as CandidateCv);

    await expect(
      service.parseMine({ id: 'user-1', role: UserRole.CANDIDATE }, 'cv-1'),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: ERROR_CODES.COMMON.CONFLICT,
      }),
    });
  });

  it('soft deletes a saved CV and promotes the next CV when default is deleted', async () => {
    cvRepo.findOne
      .mockResolvedValueOnce({
        id: 'cv-1',
        candidateId: 'candidate-1',
        documentId: 'document-1',
        title: 'Main CV',
        isDefault: true,
        parseStatus: CandidateCvParseStatus.PARSED,
        parsedAt: new Date(),
        deletedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      } as CandidateCv)
      .mockResolvedValueOnce({
        id: 'cv-2',
        candidateId: 'candidate-1',
        documentId: 'document-2',
        title: 'Backup CV',
        isDefault: false,
        deletedAt: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      } as CandidateCv);

    const result = await service.deleteMine({ id: 'user-1', role: UserRole.CANDIDATE }, 'cv-1');

    expect(cvRepo.update).toHaveBeenNthCalledWith(
      1,
      'cv-1',
      expect.objectContaining({
        deletedAt: expect.any(Date),
        isDefault: false,
      }),
    );
    expect(cvRepo.update).toHaveBeenNthCalledWith(2, 'cv-2', { isDefault: true });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ deleted: true });
  });

  it('rejects deleting a CV outside candidate ownership', async () => {
    cvRepo.findOne.mockResolvedValue(null);

    await expect(
      service.deleteMine({ id: 'user-1', role: UserRole.CANDIDATE }, 'missing-cv'),
    ).rejects.toMatchObject({
      status: 404,
      response: expect.objectContaining({
        code: ERROR_CODES.APPLICATION.CV_NOT_FOUND,
      }),
    });
  });

  it('purges physically deleted CV documents only after application retention allows it', async () => {
    cvRepo.find.mockResolvedValue([
      {
        id: 'cv-1',
        candidateId: 'candidate-1',
        documentId: 'document-1',
        deletedAt: new Date('2026-01-01T00:00:00.000Z'),
        documentDeletedAt: null,
      } as CandidateCv,
    ]);

    const result = await service.purgeDeletedCvDocuments();

    expect(applicationClientService.getCvDocumentRetention).toHaveBeenCalledWith(
      'document-1',
      expect.any(Date),
    );
    expect(documentClientService.deleteDocument).toHaveBeenCalledWith('document-1');
    expect(cvRepo.update).toHaveBeenCalledWith(
      'cv-1',
      expect.objectContaining({
        documentDeletedAt: expect.any(Date),
        documentDeleteError: null,
      }),
    );
    expect(result).toBe(1);
  });

  it('rejects unsupported CV file types before uploading', async () => {
    await expect(
      service.uploadCv(
        { id: 'user-1', role: UserRole.CANDIDATE },
        {},
        {
          originalname: 'avatar.png',
          mimetype: 'image/png',
          size: 1024,
          buffer: Buffer.from('image'),
        },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.DOCUMENT.UNSUPPORTED_FILE_TYPE,
      }),
    });
    expect(documentClientService.uploadCandidateDocument).not.toHaveBeenCalled();
  });
});
