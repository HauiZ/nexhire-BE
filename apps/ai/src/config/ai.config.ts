import { registerAs } from '@nestjs/config';

export const aiConfig = registerAs('ai', () => ({
  port: parseInt(process.env.AI_PORT ?? '3004', 10),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
    maxOutputTokens: 2048,
    temperature: 0.2,
  },
}));
