import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';

import { CvParsingService } from '../cv-parsing.service';
import { CvParseContext, CvParseProvider, CvParseRequestStatus } from '../entities/cv-parsing.enum';
import { CvParseRequest } from '../entities/cv-parse-request.entity';
import { CvParseResult } from '../entities/cv-parse-result.entity';
import { CvParseEventPublisher } from '../events/cv-parse-event.publisher';
import { AiManagementService } from '../../ai-management/ai-management.service';
import { GeminiResumeParserClient } from '../../gemini/gemini-resume-parser.client';
import { OpenAiResumeParserClient } from '../../openai/openai-resume-parser.client';
import { ProviderConfigurationException } from '../../openai/provider-configuration.exception';

describe('CvParsingService', () => {
  let service: CvParsingService;
  let aiManagementService: { getRuntimeConfig: jest.Mock; recordUsage: jest.Mock };
  let publisher: { publishCvParseFailed: jest.Mock };
  let openAiClient: { parseResumeFromUrl: jest.Mock };
  let parseRequestRepo: {
    create: jest.Mock;
    findOneOrFail: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let parseResultRepo: {
    findOne: jest.Mock;
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
    parseResultRepo = {
      findOne: jest.fn(),
    };

    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'cvParsingService.gemini.providerVersion': 'gemini-test',
        };
        return values[key] ?? fallback;
      }),
    };
    aiManagementService = {
      recordUsage: jest.fn().mockResolvedValue(undefined),
      getRuntimeConfig: jest.fn().mockResolvedValue({
        activeProvider: CvParseProvider.GEMINI,
        geminiModel: 'gemini-test',
        openAiModel: 'gpt-5.5',
      }),
    };
    publisher = { publishCvParseFailed: jest.fn().mockResolvedValue(undefined) };
    openAiClient = { parseResumeFromUrl: jest.fn() };

    service = new CvParsingService(
      {} as DataSource,
      configService as unknown as ConfigService,
      aiManagementService as unknown as AiManagementService,
      publisher as unknown as CvParseEventPublisher,
      {} as GeminiResumeParserClient,
      openAiClient as unknown as OpenAiResumeParserClient,
      parseRequestRepo as unknown as Repository<CvParseRequest>,
      parseResultRepo as unknown as Repository<CvParseResult>,
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

  it('returns latest parsed result by candidate CV id', async () => {
    parseResultRepo.findOne.mockResolvedValue({
      id: 'parse-result-1',
      parseRequestId: 'parse-request-1',
      candidateId: 'candidate-1',
      candidateCvId: 'cv-1',
      documentId: 'document-1',
      provider: CvParseProvider.GEMINI,
      providerVersion: 'gemini-test',
      normalizedPayload: {
        profile: { fullName: 'Candidate One' },
        skills: [],
        experiences: [],
        educations: [],
        certifications: [],
        projects: [],
      },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.getLatestResultByCandidateCv('cv-1');

    expect(parseResultRepo.findOne).toHaveBeenCalledWith({
      where: { candidateCvId: 'cv-1' },
      order: { createdAt: 'DESC' },
    });
    expect(result.id).toBe('parse-result-1');
    expect(result.profileApplied).toBe(true);
  });

  it('records terminal provider failure and publishes CV failure before rethrowing the same error', async () => {
    aiManagementService.getRuntimeConfig.mockResolvedValue({
      activeProvider: CvParseProvider.OPENAI,
      geminiModel: 'gemini-test',
      openAiModel: 'gpt-5.5',
    });
    const request = await parseRequestRepo.findOneOrFail();
    parseRequestRepo.findOneOrFail.mockResolvedValue({
      ...request,
      provider: CvParseProvider.OPENAI,
      providerVersion: 'gpt-5.5',
    });
    const failure = new ProviderConfigurationException('model_not_found');
    openAiClient.parseResumeFromUrl.mockRejectedValue(failure);
    await expect(
      service.processUploadedCv({
        candidateId: 'candidate-1',
        candidateUserId: 'user-1',
        candidateCvId: 'cv-1',
        documentId: 'document-1',
        context: 'PROFILE_UPDATE',
        documentUrl: 'https://storage.invalid/synthetic.pdf',
      }),
    ).rejects.toBe(failure);
    expect(aiManagementService.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        model: 'gpt-5.5',
        errorMessage: failure.message,
      }),
    );
    expect(parseRequestRepo.update).toHaveBeenLastCalledWith(
      'parse-request-1',
      expect.objectContaining({
        status: CvParseRequestStatus.FAILED,
        errorMessage: failure.message,
      }),
    );
    expect(publisher.publishCvParseFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateCvId: 'cv-1',
        parseRequestId: 'parse-request-1',
        errorMessage: failure.message,
      }),
    );
    expect(parseRequestRepo.update.mock.invocationCallOrder.at(-1)).toBeLessThan(
      publisher.publishCvParseFailed.mock.invocationCallOrder[0],
    );
    expect(openAiClient.parseResumeFromUrl).toHaveBeenCalledTimes(1);
  });
});
