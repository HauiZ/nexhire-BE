import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { ERROR_CODES, type ParsedResume } from '@nexhire/shared';

import { AiManagementService, AiUsageTokens } from '../ai-management/ai-management.service';
import { buildResumeParsePrompt } from '../cv-parsing/prompts/resume-parse.prompt';
import { GeminiResumeNormalizerService } from '../gemini/gemini-resume-normalizer.service';
import { OPENAI_PARSED_RESUME_SCHEMA } from '../openai/openai-resume.schema';
import { RawCanvasDesign } from './canvas.types';
import { buildTemplateDesignPrompt } from './prompts/template-design.prompt';
import { CANVAS_DESIGN_SCHEMA } from './schemas/canvas-design.schema';

export interface DocumentBuffer {
  data: Buffer;
  mimeType: string;
}

export interface ResumeExtraction {
  rawPayload: Record<string, unknown>;
  parsedResume: ParsedResume;
  usage?: AiUsageTokens;
}

export interface CanvasDesignExtraction {
  rawPayload: Record<string, unknown>;
  design: RawCanvasDesign;
  usage?: AiUsageTokens;
}

interface OpenAiResponse {
  status?: string;
  incomplete_details?: { reason?: string };
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}

/** Ném khi provider trả về JSON dở dang — phân biệt với lỗi hạ tầng. */
class TruncatedOutputError extends Error {
  constructor(readonly reason: string) {
    super(`OpenAI response was incomplete: ${reason}`);
  }
}

@Injectable()
export class OpenAiTemplateDesignClient {
  private readonly logger = new Logger(OpenAiTemplateDesignClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly aiManagementService: AiManagementService,
    private readonly normalizer: GeminiResumeNormalizerService,
  ) {}

  resolveModel(): Promise<string> {
    return this.aiManagementService.getOpenAiModel();
  }

  async fetchDocument(documentUrl: string): Promise<DocumentBuffer> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<ArrayBuffer>(documentUrl, {
          responseType: 'arraybuffer',
          timeout: this.timeoutMs(),
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
      this.logger.error(
        `Failed to fetch template design document: ${error instanceof AxiosError ? error.message : String(error)}`,
      );
      throw this.unavailable('Source PDF is temporarily unavailable');
    }
  }

  /**
   * Lệnh gọi #1 — trích dữ liệu. Tái dùng nguyên prompt và schema của luồng parse CV.
   *
   * Khác OpenAiResumeParserClient ở một điểm: chạy normalizer. Nhánh OpenAI của luồng
   * parse CV ứng viên bỏ qua bước này (xem Known Issues trong spec); ở đây không thể bỏ
   * vì luật 6 và 10 của sanitizer so khớp trực tiếp với ParsedResume.
   */
  async extractResume(document: DocumentBuffer): Promise<ResumeExtraction> {
    const { payload, usage } = await this.call(
      document,
      buildResumeParsePrompt(),
      'parsed_resume',
      OPENAI_PARSED_RESUME_SCHEMA,
      this.configService.get<number>('cvParsingService.openai.maxOutputTokens', 8192),
    );

    return {
      rawPayload: payload,
      parsedResume: this.normalizer.normalize(payload),
      usage,
    };
  }

  /** Lệnh gọi #2 — dựng layout, có ParsedResume của lệnh gọi #1 làm ngữ cảnh. */
  async designCanvas(
    document: DocumentBuffer,
    parsedResume: ParsedResume,
  ): Promise<CanvasDesignExtraction> {
    const { payload, usage } = await this.call(
      document,
      buildTemplateDesignPrompt(parsedResume),
      'canvas_design',
      CANVAS_DESIGN_SCHEMA,
      this.configService.get<number>('cvParsingService.templateDesign.maxOutputTokens', 16384),
    );

    return {
      rawPayload: payload,
      design: payload as unknown as RawCanvasDesign,
      usage,
    };
  }

  private async call(
    document: DocumentBuffer,
    prompt: string,
    schemaName: string,
    schema: unknown,
    maxOutputTokens: number,
  ): Promise<{ payload: Record<string, unknown>; usage?: AiUsageTokens }> {
    const apiKey = this.configService.get<string>('cvParsingService.openai.apiKey');
    if (!apiKey) {
      throw this.unavailable('OpenAI API key is not configured');
    }

    const baseUrl = this.configService.get<string>(
      'cvParsingService.openai.baseUrl',
      'https://modelapi.vn/v1',
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
                    filename: 'cv-template-source.pdf',
                    file_data: `data:${document.mimeType};base64,${document.data.toString('base64')}`,
                  },
                  { type: 'input_text', text: prompt },
                ],
              },
            ],
            max_output_tokens: maxOutputTokens,
            text: {
              format: { type: 'json_schema', name: schemaName, strict: true, schema },
            },
          },
          {
            timeout: this.timeoutMs(),
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return {
        payload: this.readPayload(response.data),
        usage: this.extractUsage(response.data),
      };
    } catch (error) {
      // Output cắt cụt là lỗi của người dùng (CV quá dài), không phải sự cố hạ tầng —
      // đừng nuốt nó vào SERVICE_UNAVAILABLE, admin sẽ không biết phải làm gì.
      if (error instanceof TruncatedOutputError) {
        throw new ServiceUnavailableException({
          code: ERROR_CODES.TEMPLATE_DESIGN.OUTPUT_TRUNCATED,
          message: `AI output was cut off (${error.reason}). Try a shorter CV or a simpler layout.`,
        });
      }

      this.logger.error(
        `OpenAI ${schemaName} call failed: endpoint=${endpoint} model=${model} ` +
          `mimeType=${document.mimeType} fileBytes=${document.data.byteLength} ` +
          `error=${error instanceof AxiosError ? error.message : String(error)} ` +
          `status=${error instanceof AxiosError ? (error.response?.status ?? 'n/a') : 'n/a'}`,
      );
      throw this.unavailable('OpenAI template designer is temporarily unavailable');
    }
  }

  /**
   * Provider chạm trần token thì trả `status: "incomplete"` kèm JSON dở dang.
   * Phải chặn TRƯỚC JSON.parse, nếu không lỗi lộ ra dưới dạng SyntaxError khó hiểu
   * thay vì thông báo đúng bệnh.
   */
  private readPayload(response: OpenAiResponse): Record<string, unknown> {
    if (response.status === 'incomplete') {
      throw new TruncatedOutputError(response.incomplete_details?.reason ?? 'unknown');
    }

    const text = this.extractText(response);
    return JSON.parse(text) as Record<string, unknown>;
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

  private timeoutMs(): number {
    return this.configService.get<number>('cvParsingService.openai.timeoutMs', 60000);
  }

  private unavailable(message: string): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
      message,
    });
  }
}
