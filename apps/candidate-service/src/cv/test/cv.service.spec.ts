import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';
import { of } from 'rxjs';
import { Repository } from 'typeorm';

import { CandidateService } from '../../candidate/candidate.service';
import { CandidateCv } from '../../candidate/entities/candidate-cv.entity';
import { CandidateCvParseStatus } from '../../candidate/entities/candidate.enum';
import { DocumentClientService } from '../../document-client/document-client.service';
import { CvService } from '../cv.service';

describe('CvService', () => {
  let service: CvService;
  let httpService: { post: jest.Mock };
  let configService: { get: jest.Mock };
  let candidateService: { ensureProfileForUser: jest.Mock };
  let documentClientService: { uploadCandidateDocument: jest.Mock };
  let cvRepo: {
    count: jest.Mock;
    create: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    httpService = { post: jest.fn() };
    configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'candidateService.services.cvParsingService': 'http://cv-parsing',
          'candidateService.http.timeoutMs': 30000,
          'candidateService.internalServiceToken': 'internal-token',
        };
        return values[key] ?? fallback;
      }),
    };
    candidateService = {
      ensureProfileForUser: jest.fn().mockResolvedValue({ id: 'candidate-1' }),
    };
    documentClientService = {
      uploadCandidateDocument: jest.fn().mockResolvedValue({
        id: 'document-1',
        url: 'https://storage.local/cv.pdf',
      }),
    };
    cvRepo = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((payload: CandidateCv) => payload),
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
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
      candidateService as unknown as CandidateService,
      documentClientService as unknown as DocumentClientService,
      cvRepo as unknown as Repository<CandidateCv>,
    );
  });

  it('uploads a CV and triggers parsing with the internal service token', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          success: true,
          data: {
            id: 'parse-request-1',
            candidateId: 'candidate-1',
            candidateCvId: 'cv-1',
            documentId: 'document-1',
            status: 'QUEUED',
          },
        },
      }),
    );

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
    expect(httpService.post).toHaveBeenCalledWith(
      'http://cv-parsing/api/v1/cv-parsing/parse',
      expect.objectContaining({
        candidateId: 'candidate-1',
        candidateCvId: 'cv-1',
        documentId: 'document-1',
        documentUrl: 'https://storage.local/cv.pdf',
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          [HEADERS.INTERNAL_SERVICE_TOKEN]: 'internal-token',
          [HEADERS.USER_ID]: 'user-1',
        }),
      }),
    );
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
