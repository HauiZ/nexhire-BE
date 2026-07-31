import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { of } from 'rxjs';

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
    expect(result).toContain('providerErrorMessage=input_file is not supported');
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
});
