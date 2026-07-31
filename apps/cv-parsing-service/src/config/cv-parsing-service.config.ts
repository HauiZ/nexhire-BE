import { registerAs } from '@nestjs/config';

export const cvParsingServiceConfig = registerAs('cvParsingService', () => ({
  port: parseInt(process.env.CV_PARSING_SERVICE_PORT ?? '3006', 10),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-service-token',
  parseProvider: process.env.CV_PARSE_PROVIDER ?? 'GEMINI',
  persistRawPayload:
    process.env.CV_PARSE_PERSIST_RAW_PAYLOAD === 'true' ||
    process.env.OPENAI_PERSIST_RAW_PAYLOAD === 'true',
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL ?? 'gemini-3.5-flash',
    maxOutputTokens: parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? '8192', 10),
    parseRetryAttempts: parseInt(process.env.GEMINI_PARSE_RETRY_ATTEMPTS ?? '0', 10),
    timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS ?? '60000', 10),
    providerVersion:
      process.env.GEMINI_PROVIDER_VERSION ?? process.env.GEMINI_MODEL ?? 'gemini-3.5-flash',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL ?? 'https://modelapi.vn/v1',
    model: process.env.OPENAI_MODEL ?? 'gpt-5.5',
    maxOutputTokens: parseInt(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? '8192', 10),
    timeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS ?? '60000', 10),
    logProviderErrorBody: process.env.OPENAI_LOG_PROVIDER_ERROR_BODY === 'true',
    providerVersion: process.env.OPENAI_PROVIDER_VERSION ?? process.env.OPENAI_MODEL ?? 'gpt-5.5',
  },
  services: {
    candidateService: process.env.CANDIDATE_SERVICE_URL ?? 'http://localhost:3002',
  },
  http: {
    timeoutMs: parseInt(process.env.CV_PARSING_SERVICE_HTTP_TIMEOUT_MS ?? '30000', 10),
  },
}));
