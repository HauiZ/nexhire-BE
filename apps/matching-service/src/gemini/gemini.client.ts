import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ERROR_CODES } from '@nexhire/shared';

/**
 * Thin wrapper over the Gemini SDK. Treat all model input (CV text, JD) as
 * untrusted; callers pass structured prompts and validate the parsed output.
 */
@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly client: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor(private readonly config: ConfigService) {
    this.client = new GoogleGenerativeAI(
      this.config.get<string>('matchingService.gemini.apiKey') as string,
    );
    this.modelName = this.config.get<string>('matchingService.gemini.model') as string;
  }

  async generate(prompt: string): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        maxOutputTokens: this.config.get<number>('matchingService.gemini.maxOutputTokens'),
        temperature: this.config.get<number>('matchingService.gemini.temperature'),
      },
    });

    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      this.logger.error(`Gemini request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'AI service is temporarily unavailable',
      });
    }
  }
}
