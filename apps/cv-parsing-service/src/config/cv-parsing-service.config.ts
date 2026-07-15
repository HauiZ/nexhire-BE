import { registerAs } from '@nestjs/config';

export const cvParsingServiceConfig = registerAs('cvParsingService', () => ({
  port: parseInt(process.env.CV_PARSING_SERVICE_PORT ?? '3006', 10),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-service-token',
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
    maxOutputTokens: 2048,
    temperature: 0.2,
  },
  skima: {
    apiKey: process.env.SKIMA_API_KEY,
    baseUrl: process.env.SKIMA_BASE_URL ?? 'https://api.skima.ai',
    parsePath: process.env.SKIMA_PARSE_PATH ?? '/resume/parse',
    timeoutMs: parseInt(process.env.SKIMA_TIMEOUT_MS ?? '30000', 10),
    providerVersion: process.env.SKIMA_PROVIDER_VERSION ?? null,
    persistRawPayload: process.env.SKIMA_PERSIST_RAW_PAYLOAD === 'true',
  },
  services: {
    candidateService: process.env.CANDIDATE_SERVICE_URL ?? 'http://localhost:3002',
  },
  http: {
    timeoutMs: parseInt(process.env.CV_PARSING_SERVICE_HTTP_TIMEOUT_MS ?? '30000', 10),
  },
}));
