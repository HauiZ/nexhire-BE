import { ConfigService } from '@nestjs/config';
import { ERROR_CODES, UserRole } from '@nexhire/shared';
import { DataSource, Repository } from 'typeorm';

import { ApplicationClientService } from '../../application-client/application-client.service';
import { CandidateService } from '../../candidate/candidate.service';
import { CandidateCv } from '../../candidate/entities/candidate-cv.entity';
import { CandidateCvParseStatus } from '../../candidate/entities/candidate.enum';
import { CvParsingClientService } from '../../cv-parsing-client/cv-parsing-client.service';
import { DocumentClientService } from '../../document-client/document-client.service';
import { CvService } from '../cv.service';

describe('CvService', () => {
  let service: CvService;
  let dataSource: { transaction: jest.Mock };
  let configService: { get: jest.Mock };
  let candidateService: { ensureProfileForUser: jest.Mock };
  let applicationClientService: { getCvDocumentRetention: jest.Mock };
  let cvParsingClientService: { createParseRequest: jest.Mock };
  let documentClientService: { deleteDocument: jest.Mock; uploadCandidateDocument: jest.Mock };
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
    cvParsingClientService = {
      createParseRequest: jest.fn().mockResolvedValue({
        id: 'parse-request-1',
        candidateId: 'candidate-1',
        candidateCvId: 'cv-1',
        documentId: 'document-1',
        status: 'QUEUED',
      }),
    };
    documentClientService = {
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
      update: jest.fn().mockResolvedValue(undefined),
    };

    service = new CvService(
      dataSource as unknown as DataSource,
      configService as unknown as ConfigService,
      candidateService as unknown as CandidateService,
      applicationClientService as unknown as ApplicationClientService,
      cvParsingClientService as unknown as CvParsingClientService,
      documentClientService as unknown as DocumentClientService,
      cvRepo as unknown as Repository<CandidateCv>,
    );
  });

  it('uploads a CV and triggers parsing with the internal service token', async () => {
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

    expect(result.parseStatus).toBe(CandidateCvParseStatus.PARSING);
    expect(cvParsingClientService.createParseRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: 'user-1', role: UserRole.CANDIDATE },
        candidateId: 'candidate-1',
        candidateCvId: 'cv-1',
        documentId: 'document-1',
        documentUrl: 'https://storage.local/cv.pdf',
      }),
    );
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
