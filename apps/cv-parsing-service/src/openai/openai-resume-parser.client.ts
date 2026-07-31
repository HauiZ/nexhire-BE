import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { ERROR_CODES, ParsedResume } from '@nexhire/shared';

import { AiManagementService, AiUsageTokens } from '../ai-management/ai-management.service';
import { buildResumeParsePrompt } from '../cv-parsing/prompts/resume-parse.prompt';
import { OPENAI_PARSED_RESUME_SCHEMA } from './openai-resume.schema';

interface DocumentBuffer {
  data: Buffer;
  mimeType: string;
}

interface OpenAiResponse {
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

export interface OpenAiResumeParsePayload {
  rawPayload: Record<string, unknown>;
  normalizedPayload: ParsedResume;
  usage?: AiUsageTokens;
}

@Injectable()
export class OpenAiResumeParserClient {
  private readonly logger = new Logger(OpenAiResumeParserClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly aiManagementService: AiManagementService,
  ) {}

  async parseResumeFromUrl(documentUrl: string): Promise<OpenAiResumeParsePayload> {
    const document = await this.fetchDocument(documentUrl);
    const { rawPayload, usage } = await this.parseDocument(document);
    return {
      rawPayload,
      normalizedPayload: rawPayload as unknown as ParsedResume,
      usage,
    };
  }

  private async parseDocument(
    document: DocumentBuffer,
  ): Promise<{ rawPayload: Record<string, unknown>; usage?: AiUsageTokens }> {
    const apiKey = this.configService.get<string>('cvParsingService.openai.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'OpenAI API key is not configured',
      });
    }

    const baseUrl = this.configService.get<string>(
      'cvParsingService.openai.baseUrl',
      'https://modelapi.vn/v1',
    );
    const timeout = this.configService.get<number>('cvParsingService.openai.timeoutMs', 60000);
    const maxOutputTokens = this.configService.get<number>(
      'cvParsingService.openai.maxOutputTokens',
      8192,
    );
    const model = await this.aiManagementService.getOpenAiModel();
    const endpoint = `${baseUrl}/responses`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<OpenAiResponse>(
          endpoint,
          {
            model,
            input: [
              {
                role: 'user',
                content: [
                  {
                    type: 'input_file',
                    filename: 'resume.pdf',
                    file_data: `data:${document.mimeType};base64,${document.data.toString('base64')}`,
                  },
                  {
                    type: 'input_text',
                    text: buildResumeParsePrompt(),
                  },
                ],
              },
            ],
            max_output_tokens: maxOutputTokens,
            text: {
              format: {
                type: 'json_schema',
                name: 'parsed_resume',
                strict: true,
                schema: OPENAI_PARSED_RESUME_SCHEMA,
              },
            },
          },
          {
            timeout,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return {
        rawPayload: this.parseJson(this.extractText(response.data)),
        usage: this.extractUsage(response.data),
      };
    } catch (error) {
      this.logger.error(
        `OpenAI resume parse failed: ${this.formatProviderError(error, {
          endpoint,
          model,
          mimeType: document.mimeType,
          fileBytes: document.data.byteLength,
        })}`,
      );
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'OpenAI resume parser is temporarily unavailable',
      });
    }
  }

  private async fetchDocument(documentUrl: string): Promise<DocumentBuffer> {
    const timeout = this.configService.get<number>('cvParsingService.openai.timeoutMs', 60000);
    try {
      const response = await firstValueFrom(
        this.httpService.get<ArrayBuffer>(documentUrl, {
          responseType: 'arraybuffer',
          timeout,
        }),
      );
      const contentType = response.headers['content-type'];
      return {
        data: Buffer.from(response.data),
        mimeType:
          typeof contentType === 'string' && contentType.trim()
            ? contentType.split(';')[0].trim()
            : 'application/pdf',
      };
    } catch (error) {
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(`Failed to fetch CV document for OpenAI parsing: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'CV document is temporarily unavailable for OpenAI parsing',
      });
    }
  }

  private extractText(response: OpenAiResponse): string {
    if (response.output_text) {
      return response.output_text;
    }
    for (const output of response.output ?? []) {
      for (const content of output.content ?? []) {
        if (content.type === 'output_text' && content.text) {
          return content.text;
        }
      }
    }
    throw new Error('OpenAI response did not include output text');
  }

  private parseJson(text: string): Record<string, unknown> {
    return JSON.parse(text) as Record<string, unknown>;
  }

  private extractUsage(response: OpenAiResponse): AiUsageTokens | undefined {
    if (!response.usage) {
      return undefined;
    }
    return {
      inputTokens: response.usage.input_tokens ?? response.usage.prompt_tokens ?? null,
      outputTokens: response.usage.output_tokens ?? response.usage.completion_tokens ?? null,
      totalTokens: response.usage.total_tokens ?? null,
    };
  }

  private formatProviderError(
    error: unknown,
    request: {
      endpoint: string;
      model: string;
      mimeType: string;
      fileBytes: number;
    },
  ): string {
    const base = `endpoint=${request.endpoint} model=${request.model} mimeType=${request.mimeType} fileBytes=${request.fileBytes}`;
    if (!(error instanceof AxiosError)) {
      return `${base} error=${String(error)}`;
    }

    return [
      base,
      `status=${error.response?.status ?? 'n/a'}`,
      `statusText=${error.response?.statusText ?? 'n/a'}`,
      `message=${error.message}`,
      `providerErrorCode=${this.providerErrorCode(error.response?.data)}`,
      `providerErrorMessage=${this.providerErrorMessage(error.response?.data)}`,
      this.shouldLogProviderErrorBody()
        ? `responseBody=${this.stringifyForLog(error.response?.data)}`
        : undefined,
    ]
      .filter((part): part is string => part !== undefined)
      .join(' ');
  }

  private providerErrorCode(value: unknown): string {
    if (this.isProviderErrorEnvelope(value)) {
      return String(value.error.code ?? 'n/a');
    }
    return 'n/a';
  }

  private providerErrorMessage(value: unknown): string {
    if (this.isProviderErrorEnvelope(value)) {
      return this.truncateForLog(String(value.error.message ?? 'n/a'));
    }
    return typeof value === 'string' ? this.truncateForLog(value) : 'n/a';
  }

  private isProviderErrorEnvelope(value: unknown): value is {
    error: { code?: unknown; message?: unknown };
  } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'error' in value &&
      typeof (value as { error?: unknown }).error === 'object' &&
      (value as { error?: unknown }).error !== null
    );
  }

  private shouldLogProviderErrorBody(): boolean {
    const reader = this.configService as { get?: (key: string, fallback?: boolean) => boolean };
    return reader.get?.('cvParsingService.openai.logProviderErrorBody', false) ?? false;
  }

  private stringifyForLog(value: unknown): string {
    if (value === undefined) {
      return 'n/a';
    }

    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return this.truncateForLog(text);
  }

  private truncateForLog(text: string): string {
    return text.length > 1000 ? `${text.slice(0, 1000)}...<truncated>` : text;
  }
}
