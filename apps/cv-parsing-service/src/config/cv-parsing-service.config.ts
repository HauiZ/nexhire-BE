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
  templateDesign: {
    // Ngân sách riêng: 8192 của luồng parse CV không đủ cho một canvas 40+ element.
    maxOutputTokens: parseInt(process.env.TEMPLATE_DESIGN_MAX_OUTPUT_TOKENS ?? '16384', 10),
    // Reaper lười trong GET /:id lật job PROCESSING quá hạn thành FAILED.
    jobTimeoutMs: parseInt(process.env.TEMPLATE_DESIGN_JOB_TIMEOUT_MS ?? '300000', 10),
  },
  services: {
    candidateService: process.env.CANDIDATE_SERVICE_URL ?? 'http://localhost:3002',
    documentStorageService: process.env.DOCUMENT_STORAGE_SERVICE_URL ?? 'http://localhost:3009',
  },
  http: {
    timeoutMs: parseInt(process.env.CV_PARSING_SERVICE_HTTP_TIMEOUT_MS ?? '30000', 10),
  },
}));
