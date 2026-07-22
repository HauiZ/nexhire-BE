import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { GeminiClient } from '../gemini.client';

describe('GeminiClient', () => {
  it('extracts a JSON object from fenced model output', () => {
    const client = new GeminiClient({} as HttpService, {} as ConfigService);

    const result = (client as unknown as { parseJson<T>(text: string): T }).parseJson<
      Record<string, unknown>
    >('```json\n{"profile":{"fullName":"Khoa"}}\n```');

    expect(result).toEqual({ profile: { fullName: 'Khoa' } });
  });

  it('extracts a JSON object when the model adds surrounding text', () => {
    const client = new GeminiClient({} as HttpService, {} as ConfigService);

    const result = (client as unknown as { parseJson<T>(text: string): T }).parseJson<
      Record<string, unknown>
    >('Here is the JSON:\n{"skills":[]}\nDone.');

    expect(result).toEqual({ skills: [] });
  });
});
