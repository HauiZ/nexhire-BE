import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ERROR_CODES, paginated } from '@nexhire/shared';

import { AI_CONFIG_KEYS, AI_MODEL_PRICING, SUPPORTED_AI_MODELS } from './ai-models.constant';
import { AiConfigResponseDto, CurrentAiConfigDto } from './dto/ai-config-response.dto';
import { AiUsageLogQueryDto } from './dto/ai-usage-log-query.dto';
import { AiUsageLogResponseDto } from './dto/ai-usage-log-response.dto';
import { UpdateAiConfigDto } from './dto/update-ai-config.dto';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { AiSystemConfig } from './entities/ai-system-config.entity';
import { CvParseContext, CvParseProvider } from '../cv-parsing/entities/cv-parsing.enum';

interface RuntimeAiConfig {
  activeProvider: CvParseProvider;
  geminiModel: string;
  openAiModel: string;
}

export interface AiUsageTokens {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}

export interface RecordAiUsageInput {
  parseRequestId: string;
  candidateId: string;
  candidateCvId: string | null;
  context: CvParseContext;
  provider: CvParseProvider;
  model: string;
  status: 'SUCCEEDED' | 'FAILED';
  latencyMs?: number | null;
  tokens?: AiUsageTokens | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AiUsageSummaryItem {
  provider: CvParseProvider;
  model: string;
  totalRequests: number;
  succeededRequests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: string | null;
  pricing: AiUsagePricing | null;
}

export interface AiUsagePricing {
  currency: 'USD';
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  multiplier: number;
  formula: string;
}

@Injectable()
export class AiManagementService {
  private readonly logger = new Logger(AiManagementService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiSystemConfig)
    private readonly configRepo: Repository<AiSystemConfig>,
    @InjectRepository(AiUsageLog)
    private readonly usageRepo: Repository<AiUsageLog>,
  ) {}

  async getConfig(): Promise<AiConfigResponseDto> {
    return {
      currentConfig: await this.getCurrentConfig(),
      supportedModels: {
        GEMINI: [...SUPPORTED_AI_MODELS.GEMINI],
        OPENAI: [...SUPPORTED_AI_MODELS.OPENAI],
      },
    };
  }

  async updateConfig(dto: UpdateAiConfigDto, adminUserId: string): Promise<AiConfigResponseDto> {
    const current = await this.getRuntimeConfig();
    const next: RuntimeAiConfig = {
      activeProvider: dto.activeProvider ?? current.activeProvider,
      geminiModel: dto.geminiModel?.trim() || current.geminiModel,
      openAiModel: dto.openAiModel?.trim() || current.openAiModel,
    };

    this.assertSupportedConfig(next);
    await Promise.all([
      this.upsertConfig(AI_CONFIG_KEYS.ACTIVE_PROVIDER, next.activeProvider, adminUserId),
      this.upsertConfig(AI_CONFIG_KEYS.GEMINI_MODEL, next.geminiModel, adminUserId),
      this.upsertConfig(AI_CONFIG_KEYS.OPENAI_MODEL, next.openAiModel, adminUserId),
    ]);

    return this.getConfig();
  }

  async getRuntimeConfig(): Promise<RuntimeAiConfig> {
    const rows = await this.configRepo.find();
    const values = new Map(rows.map((row) => [row.configKey, row.configValue]));
    const activeProvider = this.resolveProvider(values.get(AI_CONFIG_KEYS.ACTIVE_PROVIDER));

    return {
      activeProvider,
      geminiModel:
        values.get(AI_CONFIG_KEYS.GEMINI_MODEL) ??
        this.configService.get<string>('cvParsingService.gemini.model', 'gemini-3.5-flash'),
      openAiModel:
        values.get(AI_CONFIG_KEYS.OPENAI_MODEL) ??
        this.configService.get<string>('cvParsingService.openai.model', 'gpt-5.5'),
    };
  }

  async getGeminiModel(): Promise<string> {
    return (await this.getRuntimeConfig()).geminiModel;
  }

  async getOpenAiModel(): Promise<string> {
    return (await this.getRuntimeConfig()).openAiModel;
  }

  async recordUsage(input: RecordAiUsageInput): Promise<void> {
    try {
      await this.usageRepo.save(
        this.usageRepo.create({
          parseRequestId: input.parseRequestId,
          candidateId: input.candidateId,
          candidateCvId: input.candidateCvId,
          context: input.context,
          provider: input.provider,
          model: input.model,
          operation: 'CV_PARSE',
          status: input.status,
          latencyMs: input.latencyMs ?? null,
          inputTokens: input.tokens?.inputTokens ?? null,
          outputTokens: input.tokens?.outputTokens ?? null,
          totalTokens: input.tokens?.totalTokens ?? null,
          estimatedCostUsd: this.estimateCostUsd(input.provider, input.model, input.tokens),
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          metadata: input.metadata ?? null,
        }),
      );
    } catch (error) {
      this.logger.warn(`Failed to record AI usage: ${(error as Error).message}`);
    }
  }

  async getUsageSummary(days = 30): Promise<AiUsageSummaryItem[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.usageRepo
      .createQueryBuilder('usage')
      .select('usage.provider', 'provider')
      .addSelect('usage.model', 'model')
      .addSelect('COUNT(*)', 'totalRequests')
      .addSelect(`COUNT(*) FILTER (WHERE usage.status = 'SUCCEEDED')`, 'succeededRequests')
      .addSelect(`COUNT(*) FILTER (WHERE usage.status = 'FAILED')`, 'failedRequests')
      .addSelect('COALESCE(SUM(usage.inputTokens), 0)', 'inputTokens')
      .addSelect('COALESCE(SUM(usage.outputTokens), 0)', 'outputTokens')
      .addSelect('COALESCE(SUM(usage.totalTokens), 0)', 'totalTokens')
      .addSelect('SUM(usage.estimatedCostUsd)', 'estimatedCostUsd')
      .where('usage.createdAt >= :since', { since })
      .groupBy('usage.provider')
      .addGroupBy('usage.model')
      .orderBy('usage.provider', 'ASC')
      .addOrderBy('usage.model', 'ASC')
      .getRawMany<{
        provider: CvParseProvider;
        model: string;
        totalRequests: string;
        succeededRequests: string;
        failedRequests: string;
        inputTokens: string;
        outputTokens: string;
        totalTokens: string;
        estimatedCostUsd: string | null;
      }>();

    return rows.map((row) => ({
      provider: row.provider,
      model: row.model,
      totalRequests: Number(row.totalRequests),
      succeededRequests: Number(row.succeededRequests),
      failedRequests: Number(row.failedRequests),
      inputTokens: Number(row.inputTokens),
      outputTokens: Number(row.outputTokens),
      totalTokens: Number(row.totalTokens),
      estimatedCostUsd: row.estimatedCostUsd,
      pricing: this.pricingFor(row.provider, row.model),
    }));
  }

  async getUsageLogs(query: AiUsageLogQueryDto) {
    const builder = this.usageRepo.createQueryBuilder('usage');

    if (query.provider) {
      builder.andWhere('usage.provider = :provider', { provider: query.provider });
    }
    if (query.model?.trim()) {
      builder.andWhere('usage.model = :model', { model: query.model.trim() });
    }
    if (query.status) {
      builder.andWhere('usage.status = :status', { status: query.status });
    }
    if (query.candidateCvId?.trim()) {
      builder.andWhere('usage.candidateCvId = :candidateCvId', {
        candidateCvId: query.candidateCvId.trim(),
      });
    }
    if (query.from) {
      builder.andWhere('usage.createdAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      builder.andWhere('usage.createdAt <= :to', { to: new Date(query.to) });
    }

    const [items, total] = await builder
      .orderBy('usage.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return paginated(
      items.map((item) => this.mapUsageLog(item)),
      total,
      query.page,
      query.limit,
    );
  }

  private async getCurrentConfig(): Promise<CurrentAiConfigDto> {
    const runtime = await this.getRuntimeConfig();
    const rows = await this.configRepo.find();
    const latestRow = rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

    return {
      ...runtime,
      updatedByUserId: latestRow?.updatedByUserId ?? null,
      updatedAt: latestRow?.updatedAt ?? null,
    };
  }

  private mapUsageLog(log: AiUsageLog): AiUsageLogResponseDto {
    return {
      id: log.id,
      parseRequestId: log.parseRequestId,
      candidateId: log.candidateId,
      candidateCvId: log.candidateCvId,
      context: log.context,
      provider: log.provider,
      model: log.model,
      operation: log.operation,
      status: log.status,
      latencyMs: log.latencyMs,
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
      totalTokens: log.totalTokens,
      estimatedCostUsd: log.estimatedCostUsd,
      errorCode: log.errorCode,
      errorMessage: log.errorMessage,
      metadata: log.metadata,
      createdAt: log.createdAt,
    };
  }

  private estimateCostUsd(
    provider: CvParseProvider,
    model: string,
    tokens?: AiUsageTokens | null,
  ): string | null {
    const pricing = AI_MODEL_PRICING[provider]?.[model];
    if (!pricing || tokens?.inputTokens == null || tokens.outputTokens == null) {
      return null;
    }

    const cost =
      ((tokens.inputTokens * pricing.inputUsdPerMillionTokens +
        tokens.outputTokens * pricing.outputUsdPerMillionTokens) /
        1_000_000) *
      pricing.multiplier;

    return cost.toFixed(6);
  }

  private pricingFor(provider: CvParseProvider, model: string): AiUsagePricing | null {
    const pricing = AI_MODEL_PRICING[provider]?.[model];
    if (!pricing) {
      return null;
    }

    return {
      currency: 'USD',
      inputUsdPerMillionTokens: pricing.inputUsdPerMillionTokens,
      outputUsdPerMillionTokens: pricing.outputUsdPerMillionTokens,
      multiplier: pricing.multiplier,
      formula:
        '((inputTokens * inputUsdPerMillionTokens) + (outputTokens * outputUsdPerMillionTokens)) / 1000000 * multiplier',
    };
  }

  private async upsertConfig(
    configKey: string,
    configValue: string,
    updatedByUserId: string,
  ): Promise<void> {
    await this.configRepo.upsert(
      this.configRepo.create({
        configKey,
        configValue,
        updatedByUserId,
      }),
      ['configKey'],
    );
  }

  private resolveProvider(value: string | undefined): CvParseProvider {
    if (value === CvParseProvider.OPENAI) {
      return CvParseProvider.OPENAI;
    }
    if (value === CvParseProvider.GEMINI) {
      return CvParseProvider.GEMINI;
    }
    return this.configService.get<string>('cvParsingService.parseProvider', 'GEMINI') ===
      CvParseProvider.OPENAI
      ? CvParseProvider.OPENAI
      : CvParseProvider.GEMINI;
  }

  private assertSupportedConfig(config: RuntimeAiConfig): void {
    if (!Object.values(CvParseProvider).includes(config.activeProvider)) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'Unsupported AI provider',
      });
    }

    const supportedGeminiModel = SUPPORTED_AI_MODELS.GEMINI.some(
      (model) => model.id === config.geminiModel,
    );
    if (!supportedGeminiModel) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'Unsupported Gemini model',
      });
    }

    const supportedOpenAiModel = SUPPORTED_AI_MODELS.OPENAI.some(
      (model) => model.id === config.openAiModel,
    );
    if (!supportedOpenAiModel) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'Unsupported OpenAI model',
      });
    }
  }
}
