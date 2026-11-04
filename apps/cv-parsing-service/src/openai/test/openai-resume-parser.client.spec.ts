import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ProviderConfigurationException } from '../provider-configuration.exception';

import { AiManagementService } from '../../ai-management/ai-management.service';
import { buildResumeParsePrompt } from '../../cv-parsing/prompts/resume-parse.prompt';
import { OpenAiResumeParserClient } from '../openai-resume-parser.client';

describe('OpenAiResumeParserClient', () => {
  it('extracts output_text from an OpenAI response', () => {
    const client = new OpenAiResumeParserClient(
      {} as HttpService,
      {} as ConfigService,
      {} as AiManagementService,
    );

    const result = (client as unknown as { extractText(response: unknown): string }).extractText({
      output_text: '{"profile":{}}',
    });

    expect(result).toBe('{"profile":{}}');
  });

  it('extracts nested output text from an OpenAI response', () => {
    const client = new OpenAiResumeParserClient(
      {} as HttpService,
      {} as ConfigService,
      {} as AiManagementService,
    );

    const result = (client as unknown as { extractText(response: unknown): string }).extractText({
      output: [{ content: [{ type: 'output_text', text: '{"skills":[]}' }] }],
    });

    expect(result).toBe('{"skills":[]}');
  });

  it('formats provider error summary without raw body by default', () => {
    const client = new OpenAiResumeParserClient(
      {} as HttpService,
      {} as ConfigService,
      {} as AiManagementService,
    );
    const error = new AxiosError(
      'Request failed with status code 503',
      undefined,
      undefined,
      undefined,
      {
        status: 503,
        statusText: 'Service Unavailable',
        data: { error: { code: 'model_not_found', message: 'input_file is not supported' } },
        headers: {},
        config: { headers: undefined } as never,
      },
    );

    const result = (
      client as unknown as {
        formatProviderError(error: unknown, request: unknown): string;
      }
    ).formatProviderError(error, {
      endpoint: 'https://modelapi.vn/v1/responses',
      model: 'gpt-5.5',
      mimeType: 'application/pdf',
      fileBytes: 1024,
    });

    expect(result).toContain('status=503');
    expect(result).toContain('model=gpt-5.5');
    expect(result).toContain('providerErrorCode=model_not_found');
    expect(result).not.toContain('input_file is not supported');
    expect(result).not.toContain('responseBody=');
  });

  it('includes provider response body when debug logging is enabled', () => {
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'cvParsingService.openai.logProviderErrorBody' ? true : fallback,
      ),
    };
    const client = new OpenAiResumeParserClient(
      {} as HttpService,
      configService as unknown as ConfigService,
      {} as AiManagementService,
    );
    const error = new AxiosError(
      'Request failed with status code 503',
      undefined,
      undefined,
      undefined,
      {
        status: 503,
        statusText: 'Service Unavailable',
        data: { error: { code: 'model_not_found', message: 'model unavailable' } },
        headers: {},
        config: { headers: undefined } as never,
      },
    );

    const result = (
      client as unknown as {
        formatProviderError(error: unknown, request: unknown): string;
      }
    ).formatProviderError(error, {
      endpoint: 'https://modelapi.vn/v1/responses',
      model: 'gpt-5.5',
      mimeType: 'application/pdf',
      fileBytes: 1024,
    });

    expect(result).toContain('responseBody=');
  });

  it('uses the shared resume parse prompt when calling OpenAI', async () => {
    const httpService = {
      get: jest.fn().mockReturnValue(
        of({
          data: Buffer.from('pdf'),
          headers: { 'content-type': 'application/pdf' },
        }),
      ),
      post: jest.fn().mockReturnValue(
        of({
          data: {
            output_text: JSON.stringify({
              profile: {},
              skills: [],
              experiences: [],
              educations: [],
              certifications: [],
              projects: [],
            }),
          },
        }),
      ),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'cvParsingService.openai.apiKey': 'openai-key',
          'cvParsingService.openai.baseUrl': 'https://modelapi.vn/v1',
        };
        return values[key] ?? fallback;
      }),
    };
    const aiManagementService = {
      getOpenAiModel: jest.fn().mockResolvedValue('gpt-5.5'),
    };
    const client = new OpenAiResumeParserClient(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
      aiManagementService as unknown as AiManagementService,
    );

    await client.parseResumeFromUrl('https://storage.local/cv.pdf');

    expect(httpService.post).toHaveBeenCalledWith(
      'https://modelapi.vn/v1/responses',
      expect.objectContaining({
        model: 'gpt-5.5',
        input: [
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'input_text',
                text: buildResumeParsePrompt(),
              }),
            ]),
          }),
        ],
      }),
      expect.any(Object),
    );
  });

  it.each([
    [503, 'model_not_found', true],
    [503, 'invalid_api_key', true],
    [401, undefined, true],
    [403, undefined, true],
    [503, 'server_error', false],
    [503, undefined, false],
    [429, 'rate_limit_exceeded', false],
    [undefined, undefined, false],
  ])(
    'classifies status=%s code=%s terminal=%s without leaking provider text',
    async (status, code, terminal) => {
      const secret = 'SYNTHETIC_SECRET_CV_CONTENT';
      const error = new AxiosError(
        secret,
        'ECONNABORTED',
        undefined,
        undefined,
        status === undefined
          ? undefined
          : {
              status,
              statusText: secret,
              data: { error: { code, message: secret } },
              headers: {},
              config: { headers: undefined } as never,
            },
      );
      const http = {
        get: jest.fn().mockReturnValue(of({ data: Buffer.from('synthetic-pdf'), headers: {} })),
        post: jest.fn().mockReturnValue(throwError(() => error)),
      };
      const config = {
        get: (key: string, fallback?: unknown) =>
          key === 'cvParsingService.openai.apiKey' ? 'synthetic-key' : fallback,
      };
      const client = new OpenAiResumeParserClient(
        http as unknown as HttpService,
        config as ConfigService,
        { getOpenAiModel: async () => 'configured-alias' } as AiManagementService,
      );
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      try {
        const failure = await client
          .parseResumeFromUrl('https://storage.invalid/synthetic.pdf')
          .catch((e) => e);
        expect(failure).toBeInstanceOf(ServiceUnavailableException);
        expect(failure instanceof ProviderConfigurationException).toBe(terminal);
        expect(JSON.stringify(failure.getResponse())).not.toContain(secret);
        expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
        expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-key');
        expect(http.post).toHaveBeenCalledTimes(1);
      } finally {
        log.mockRestore();
      }
    },
  );

  it('marks a missing API key terminal without calling the provider', async () => {
    const http = {
      get: jest.fn().mockReturnValue(of({ data: Buffer.from('synthetic-pdf'), headers: {} })),
      post: jest.fn(),
    };
    const client = new OpenAiResumeParserClient(
      http as unknown as HttpService,
      { get: () => undefined } as unknown as ConfigService,
      {} as AiManagementService,
    );
    await expect(
      client.parseResumeFromUrl('https://storage.invalid/synthetic.pdf'),
    ).rejects.toBeInstanceOf(ProviderConfigurationException);
    expect(http.post).not.toHaveBeenCalled();
  });
});
