import { ConfigService } from '@nestjs/config';

import { GeminiResumeParserClient } from '../gemini-resume-parser.client';
import { GeminiClient } from '../gemini.client';
import { GeminiResumeNormalizerService } from '../gemini-resume-normalizer.service';

describe('GeminiResumeParserClient', () => {
  let geminiClient: { generateJsonFromDocumentBuffer: jest.Mock };
  let normalizer: { normalize: jest.Mock };

  function buildClient(retryAttempts: number): GeminiResumeParserClient {
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'cvParsingService.gemini.parseRetryAttempts') {
          return retryAttempts;
        }
        return fallback;
      }),
    };
    return new GeminiResumeParserClient(
      configService as unknown as ConfigService,
      geminiClient as unknown as GeminiClient,
      normalizer as unknown as GeminiResumeNormalizerService,
    );
  }

  beforeEach(() => {
    geminiClient = {
      generateJsonFromDocumentBuffer: jest.fn().mockResolvedValue({ profile: {} }),
    };
    normalizer = {
      normalize: jest.fn().mockReturnValue({
        profile: {},
        skills: [],
        experiences: [],
        educations: [],
        certifications: [],
        projects: [],
      }),
    };
  });

  it('does not retry when retry attempts is zero', async () => {
    geminiClient.generateJsonFromDocumentBuffer.mockRejectedValueOnce(new Error('invalid json'));

    await expect(
      buildClient(0).parseResumeFromBuffer(Buffer.from('cv'), 'application/pdf'),
    ).rejects.toThrow('invalid json');

    expect(geminiClient.generateJsonFromDocumentBuffer).toHaveBeenCalledTimes(1);
  });

  it('retries according to configured attempts', async () => {
    geminiClient.generateJsonFromDocumentBuffer
      .mockRejectedValueOnce(new Error('invalid json'))
      .mockResolvedValueOnce({ profile: { fullName: 'Khoa' } });

    const result = await buildClient(1).parseResumeFromBuffer(Buffer.from('cv'), 'application/pdf');

    expect(geminiClient.generateJsonFromDocumentBuffer).toHaveBeenCalledTimes(2);
    expect(result.normalizedPayload.profile).toEqual({});
  });
});
