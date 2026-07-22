import { ERROR_CODES } from '@nexhire/shared';

import { ManualCvParsingService } from '../manual-cv-parsing.service';
import { GeminiResumeParserClient } from '../../../gemini/gemini-resume-parser.client';

describe('ManualCvParsingService', () => {
  let service: ManualCvParsingService;
  let geminiParserClient: { parseResumeFromBuffer: jest.Mock };
  let nodeEnv: string | undefined;

  beforeEach(() => {
    nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    geminiParserClient = {
      parseResumeFromBuffer: jest.fn().mockResolvedValue({
        normalizedPayload: {
          profile: { fullName: 'Nguyen Minh Khoa' },
          skills: [],
          experiences: [],
          educations: [],
          certifications: [],
          projects: [],
        },
        rawPayload: { profile: { fullName: 'Nguyen Minh Khoa' } },
      }),
    };
    service = new ManualCvParsingService(geminiParserClient as unknown as GeminiResumeParserClient);
  });

  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
  });

  it('parses a CV file with Gemini without persisting data', async () => {
    const result = await service.parseGeminiFile({
      buffer: Buffer.from('cv'),
      mimetype: 'application/pdf',
      size: 1024,
    });

    expect(geminiParserClient.parseResumeFromBuffer).toHaveBeenCalledWith(
      Buffer.from('cv'),
      'application/pdf',
    );
    expect(result.normalizedPayload.profile.fullName).toBe('Nguyen Minh Khoa');
    expect(result.rawProviderPayload).toEqual({ profile: { fullName: 'Nguyen Minh Khoa' } });
  });

  it('rejects manual parsing in production', async () => {
    process.env.NODE_ENV = 'production';

    await expect(
      service.parseGeminiFile({
        buffer: Buffer.from('cv'),
        mimetype: 'application/pdf',
        size: 1024,
      }),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({
        code: ERROR_CODES.COMMON.FORBIDDEN,
      }),
    });
  });

  it('requires a supported PDF file', async () => {
    await expect(service.parseGeminiFile()).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.DOCUMENT.FILE_REQUIRED,
      }),
    });

    await expect(
      service.parseGeminiFile({
        buffer: Buffer.from('image'),
        mimetype: 'image/png',
        size: 1024,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.DOCUMENT.UNSUPPORTED_FILE_TYPE,
      }),
    });
  });
});
