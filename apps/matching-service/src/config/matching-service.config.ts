import { registerAs } from '@nestjs/config';

export const matchingServiceConfig = registerAs('matchingService', () => ({
  port: parseInt(process.env.MATCHING_SERVICE_PORT ?? '3007', 10),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
    maxOutputTokens: 2048,
    temperature: 0.2,
  },
}));
