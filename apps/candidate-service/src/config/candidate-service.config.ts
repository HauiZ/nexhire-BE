import { registerAs } from '@nestjs/config';

export const candidateServiceConfig = registerAs('candidateService', () => ({
  port: parseInt(process.env.CANDIDATE_SERVICE_PORT ?? '3002', 10),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-service-token',
  services: {
    documentStorageService: process.env.DOCUMENT_STORAGE_SERVICE_URL ?? 'http://localhost:3009',
    cvParsingService: process.env.CV_PARSING_SERVICE_URL ?? 'http://localhost:3006',
  },
  http: {
    timeoutMs: parseInt(process.env.CANDIDATE_SERVICE_HTTP_TIMEOUT_MS ?? '30000', 10),
  },
}));
