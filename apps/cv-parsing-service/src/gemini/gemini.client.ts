import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { ERROR_CODES } from '@nexhire/shared';

import { AiManagementService } from '../ai-management/ai-management.service';

interface DocumentBuffer {
  data: Buffer;
  mimeType: string;
}

/**
 * Thin wrapper over the Gemini SDK. Treat all model input (CV files, prompts)
 * as untrusted; callers validate and normalize the model output.
 */
@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly aiManagementService: AiManagementService,
  ) {}

  async generate(prompt: string): Promise<string> {
    return this.generateContent([prompt]);
  }

  async generateJsonFromDocumentUrl<T>(documentUrl: string, prompt: string): Promise<T> {
    const document = await this.fetchDocument(documentUrl);
    return this.generateJsonFromDocumentBuffer<T>(document.data, document.mimeType, prompt);
  }

  async generateJsonFromDocumentBuffer<T>(
    data: Buffer,
    mimeType: string,
    prompt: string,
  ): Promise<T> {
    const text = await this.generateContent([
      {
        inlineData: {
          data: data.toString('base64'),
          mimeType,
        },
      },
      prompt,
    ]);
    return this.parseJson<T>(text);
  }

  private async generateContent(parts: Array<string | Part>): Promise<string> {
    const apiKey = this.config.get<string>('cvParsingService.gemini.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Gemini API key is not configured',
      });
    }

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: await this.aiManagementService.getGeminiModel(),
      generationConfig: {
        maxOutputTokens: this.config.get<number>('cvParsingService.gemini.maxOutputTokens', 2048),
        responseMimeType: 'application/json',
      },
    });

    try {
      const result = await model.generateContent(parts);
      return result.response.text();
    } catch (err) {
      this.logger.error(`Gemini request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'AI service is temporarily unavailable',
      });
    }
  }

  private async fetchDocument(documentUrl: string): Promise<DocumentBuffer> {
    const timeout = this.config.get<number>('cvParsingService.gemini.timeoutMs', 60000);
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
      this.logger.error(`Failed to fetch CV document for Gemini parsing: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'CV document is temporarily unavailable for parsing',
      });
    }
  }

  private parseJson<T>(text: string): T {
    const clean = this.extractJsonObject(
      text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim(),
    );
    try {
      return JSON.parse(clean) as T;
    } catch (error) {
      this.logger.warn(`Gemini returned invalid JSON: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'AI service returned an invalid CV parse response',
      });
    }
  }

  private extractJsonObject(value: string): string {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return value;
    }
    return value.slice(start, end + 1);
  }
}
