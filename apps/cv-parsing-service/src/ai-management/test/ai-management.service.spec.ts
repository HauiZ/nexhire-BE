import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { AiManagementService } from '../ai-management.service';
import { AiUsageLog } from '../entities/ai-usage-log.entity';
import { AiSystemConfig } from '../entities/ai-system-config.entity';
import { CvParseContext } from '../../cv-parsing/entities/cv-parsing.enum';
import { CvParseProvider } from '../../cv-parsing/entities/cv-parsing.enum';

describe('AiManagementService', () => {
  let service: AiManagementService;
  let configRepo: {
    create: jest.Mock;
    find: jest.Mock;
    upsert: jest.Mock;
  };
  let usageRepo: {
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(() => {
    configRepo = {
      create: jest.fn((payload: AiSystemConfig) => payload),
      find: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
    };
    usageRepo = {
      create: jest.fn((payload: AiUsageLog) => payload),
      save: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'cvParsingService.parseProvider': 'GEMINI',
          'cvParsingService.gemini.model': 'gemini-3.5-flash',
        };
        return values[key] ?? fallback;
      }),
    };

    service = new AiManagementService(
      configService as unknown as ConfigService,
      configRepo as unknown as Repository<AiSystemConfig>,
      usageRepo as unknown as Repository<AiUsageLog>,
    );
  });

  it('returns env-backed defaults when no DB config exists', async () => {
    const result = await service.getConfig();

    expect(result.currentConfig.activeProvider).toBe(CvParseProvider.GEMINI);
    expect(result.currentConfig.geminiModel).toBe('gemini-3.5-flash');
    expect(result.currentConfig.openAiModel).toBe('gpt-5.5');
    expect(result.supportedModels.GEMINI.length).toBeGreaterThan(0);
  });

  it('persists admin updates for supported provider and model', async () => {
    await service.updateConfig(
      {
        activeProvider: CvParseProvider.OPENAI,
        geminiModel: 'gemini-1.5-flash',
        openAiModel: 'gpt-4o',
      },
      'admin-1',
    );

    expect(configRepo.upsert).toHaveBeenCalledTimes(3);
    expect(configRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        configKey: 'ACTIVE_AI_PROVIDER',
        configValue: CvParseProvider.OPENAI,
        updatedByUserId: 'admin-1',
      }),
    );
  });

  it('allows OpenAI-compatible models configured through admin', async () => {
    await service.updateConfig(
      {
        activeProvider: CvParseProvider.OPENAI,
        openAiModel: 'gpt-5.5',
      },
      'admin-1',
    );

    expect(configRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        configKey: 'OPENAI_ACTIVE_MODEL',
        configValue: 'gpt-5.5',
      }),
    );
  });

  it('records AI usage without requiring token usage fields', async () => {
    await service.recordUsage({
      parseRequestId: 'parse-request-1',
      candidateId: 'candidate-1',
      candidateCvId: 'cv-1',
      context: CvParseContext.PROFILE_UPDATE,
      provider: CvParseProvider.OPENAI,
      model: 'gpt-5.5',
      status: 'FAILED',
      errorCode: 'AI.SERVICE_UNAVAILABLE',
      errorMessage: 'provider unavailable',
    });

    expect(usageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        parseRequestId: 'parse-request-1',
        provider: CvParseProvider.OPENAI,
        model: 'gpt-5.5',
        status: 'FAILED',
        inputTokens: null,
      }),
    );
  });

  it('estimates usage cost when pricing exists for the model', async () => {
    await service.recordUsage({
      parseRequestId: 'parse-request-1',
      candidateId: 'candidate-1',
      candidateCvId: 'cv-1',
      context: CvParseContext.PROFILE_UPDATE,
      provider: CvParseProvider.OPENAI,
      model: 'gpt-5.5',
      status: 'SUCCEEDED',
      tokens: {
        inputTokens: 6976,
        outputTokens: 758,
        totalTokens: 7734,
      },
    });

    expect(usageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedCostUsd: '0.051858',
      }),
    );
  });

  it('returns pricing breakdown in usage summary', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          provider: CvParseProvider.OPENAI,
          model: 'gpt-5.5',
          totalRequests: '1',
          succeededRequests: '1',
          failedRequests: '0',
          inputTokens: '6976',
          outputTokens: '758',
          totalTokens: '7734',
          estimatedCostUsd: '0.051858',
        },
      ]),
    };
    usageRepo.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.getUsageSummary();

    expect(result[0]).toEqual(
      expect.objectContaining({
        estimatedCostUsd: '0.051858',
        pricing: expect.objectContaining({
          currency: 'USD',
          inputUsdPerMillionTokens: 5,
          outputUsdPerMillionTokens: 30,
          multiplier: 0.9,
        }),
      }),
    );
  });

  it('lists AI usage logs with filters and pagination', async () => {
    const usageLog = {
      id: 'usage-1',
      parseRequestId: 'parse-request-1',
      candidateId: 'candidate-1',
      candidateCvId: 'cv-1',
      context: CvParseContext.PROFILE_UPDATE,
      provider: CvParseProvider.OPENAI,
      model: 'gpt-5.5',
      operation: 'CV_PARSE',
      status: 'FAILED',
      latencyMs: 1200,
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      estimatedCostUsd: '0.001000',
      errorCode: 'AI.SERVICE_UNAVAILABLE',
      errorMessage: 'provider unavailable',
      metadata: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    };
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[usageLog], 1]),
    };
    usageRepo.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.getUsageLogs({
      page: 2,
      limit: 10,
      provider: CvParseProvider.OPENAI,
      model: 'gpt-5.5',
      status: 'FAILED',
      candidateCvId: 'cv-1',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-01T23:59:59.999Z',
      skip: 10,
    } as never);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('usage.provider = :provider', {
      provider: CvParseProvider.OPENAI,
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('usage.status = :status', {
      status: 'FAILED',
    });
    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      data: [expect.objectContaining({ id: 'usage-1', status: 'FAILED' })],
      meta: { page: 2, limit: 10, total: 1 },
    });
  });

  it('rejects unsupported Gemini models', async () => {
    await expect(
      service.updateConfig({ geminiModel: 'image-model' }, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
