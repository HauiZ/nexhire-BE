import { registerAs } from '@nestjs/config';

export const cvParsingServiceConfig = registerAs('cvParsingService', () => ({
  port: parseInt(process.env.CV_PARSING_SERVICE_PORT ?? '3006', 10),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
    maxOutputTokens: 2048,
    temperature: 0.2,
  },
}));
