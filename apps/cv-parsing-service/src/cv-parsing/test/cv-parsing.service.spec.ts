import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';

import { CvParsingService } from '../cv-parsing.service';
import { CvParseContext, CvParseProvider, CvParseRequestStatus } from '../entities/cv-parsing.enum';
import { CvParseRequest } from '../entities/cv-parse-request.entity';
import { CandidateClientService } from '../../candidate-client/candidate-client.service';
import { GeminiResumeParserClient } from '../../gemini/gemini-resume-parser.client';
import { ResumeNormalizerService } from '../../skima/resume-normalizer.service';
import { SkimaResumeParserClient } from '../../skima/skima-resume-parser.client';

describe('CvParsingService', () => {
  let service: CvParsingService;
  let parseRequestRepo: {
    create: jest.Mock;
    findOneOrFail: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    parseRequestRepo = {
      create: jest.fn((payload: CvParseRequest) => payload),
      findOneOrFail: jest.fn(),
      save: jest.fn((payload: CvParseRequest) =>
        Promise.resolve({
          ...payload,
          id: 'parse-request-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ),
      update: jest.fn(),
    };
    parseRequestRepo.findOneOrFail.mockResolvedValue({
      id: 'parse-request-1',
      candidateId: 'candidate-1',
      requestedByUserId: 'user-1',
      candidateCvId: 'cv-1',
      documentId: 'document-1',
      context: CvParseContext.PROFILE_UPDATE,
      status: CvParseRequestStatus.QUEUED,
      provider: CvParseProvider.GEMINI,
      providerVersion: 'gemini-test',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'cvParsingService.parseProvider': 'GEMINI',
          'cvParsingService.gemini.providerVersion': 'gemini-test',
        };
        return values[key] ?? fallback;
      }),
    };

    service = new CvParsingService(
      {} as DataSource,
      configService as unknown as ConfigService,
      {} as CandidateClientService,
      {} as GeminiResumeParserClient,
      {} as SkimaResumeParserClient,
      {} as ResumeNormalizerService,
      parseRequestRepo as unknown as Repository<CvParseRequest>,
    );
  });

  it('creates parse requests with Gemini as the default provider', async () => {
    const result = await service.createParseRequest({
      candidateId: 'candidate-1',
      requestedByUserId: 'user-1',
      candidateCvId: 'cv-1',
      documentId: 'document-1',
      context: CvParseContext.PROFILE_UPDATE,
    });

    expect(parseRequestRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: CvParseProvider.GEMINI,
        providerVersion: 'gemini-test',
        status: CvParseRequestStatus.QUEUED,
      }),
    );
    expect(result.provider).toBe(CvParseProvider.GEMINI);
  });
});
