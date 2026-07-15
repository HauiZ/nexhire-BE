import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { ERROR_CODES } from '@nexhire/shared';

export type SkimaResumePayload = Record<string, unknown>;

interface SkimaResponseEnvelope {
  data?: unknown;
  result?: unknown;
  resume?: unknown;
}

@Injectable()
export class SkimaResumeParserClient {
  private readonly logger = new Logger(SkimaResumeParserClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async parseResumeFromUrl(documentUrl: string): Promise<SkimaResumePayload> {
    const apiKey = this.configService.get<string>('cvParsingService.skima.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Skima API key is not configured',
      });
    }

    const baseUrl = this.configService.get<string>('cvParsingService.skima.baseUrl');
    const parsePath = this.configService.get<string>(
      'cvParsingService.skima.parsePath',
      '/resume/parse',
    );
    const timeout = this.configService.get<number>('cvParsingService.skima.timeoutMs', 30000);

    try {
      const response = await firstValueFrom(
        this.httpService.post<SkimaResponseEnvelope>(
          `${baseUrl}${parsePath}`,
          { fileUrl: documentUrl },
          {
            timeout,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return this.unwrapResponse(response.data);
    } catch (error) {
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(`Skima resume parse failed: ${detail}`);
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: 'Resume parser is temporarily unavailable',
      });
    }
  }

  private unwrapResponse(response: SkimaResponseEnvelope): SkimaResumePayload {
    const payload = response.data ?? response.result ?? response.resume ?? response;
    if (this.isRecord(payload)) {
      return payload;
    }
    return { value: payload };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
