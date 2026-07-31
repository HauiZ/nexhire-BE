import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ParsedResume } from '@nexhire/shared';

import { buildResumeParsePrompt } from '../cv-parsing/prompts/resume-parse.prompt';
import { GeminiClient } from './gemini.client';
import { GeminiResumeNormalizerService } from './gemini-resume-normalizer.service';

export interface GeminiResumeParsePayload {
  rawPayload: Record<string, unknown>;
  normalizedPayload: ParsedResume;
}

@Injectable()
export class GeminiResumeParserClient {
  private readonly logger = new Logger(GeminiResumeParserClient.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiClient: GeminiClient,
    private readonly normalizer: GeminiResumeNormalizerService,
  ) {}

  async parseResumeFromUrl(documentUrl: string): Promise<GeminiResumeParsePayload> {
    const prompt = buildResumeParsePrompt();
    const rawPayload = await this.generateWithRetry(documentUrl, prompt);
    return {
      rawPayload,
      normalizedPayload: this.normalizer.normalize(rawPayload),
    };
  }

  async parseResumeFromBuffer(buffer: Buffer, mimeType: string): Promise<GeminiResumeParsePayload> {
    const prompt = buildResumeParsePrompt();
    const rawPayload = await this.generateBufferWithRetry(buffer, mimeType, prompt);
    return {
      rawPayload,
      normalizedPayload: this.normalizer.normalize(rawPayload),
    };
  }

  private async generateWithRetry(
    documentUrl: string,
    prompt: string,
  ): Promise<Record<string, unknown>> {
    return this.runWithRetry(() =>
      this.geminiClient.generateJsonFromDocumentUrl<Record<string, unknown>>(documentUrl, prompt),
    );
  }

  private async generateBufferWithRetry(
    buffer: Buffer,
    mimeType: string,
    prompt: string,
  ): Promise<Record<string, unknown>> {
    return this.runWithRetry(() =>
      this.geminiClient.generateJsonFromDocumentBuffer<Record<string, unknown>>(
        buffer,
        mimeType,
        prompt,
      ),
    );
  }

  private async runWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    const retryAttempts = this.configService.get<number>(
      'cvParsingService.gemini.parseRetryAttempts',
      0,
    );
    let attempt = 0;

    while (true) {
      try {
        return await operation();
      } catch (error) {
        if (attempt >= retryAttempts) {
          throw error;
        }
        attempt += 1;
        this.logger.warn(
          `Gemini CV parse attempt failed, retrying ${attempt}/${retryAttempts}: ${
            (error as Error).message
          }`,
        );
      }
    }
  }
}
