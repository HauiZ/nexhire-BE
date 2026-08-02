import { registerAs } from '@nestjs/config';

export const applicationServiceConfig = registerAs('applicationService', () => ({
  port: parseInt(process.env.APPLICATION_SERVICE_PORT ?? '3005', 10),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-service-token',
  http: {
    timeoutMs: parseInt(process.env.APPLICATION_SERVICE_HTTP_TIMEOUT_MS ?? '5000', 10),
  },
  services: {
    candidateService: process.env.CANDIDATE_SERVICE_URL ?? 'http://localhost:3002',
    jobService: process.env.JOB_SERVICE_URL ?? 'http://localhost:3004',
    cvParsingService: process.env.CV_PARSING_SERVICE_URL ?? 'http://localhost:3006',
    matchingService: process.env.MATCHING_SERVICE_URL ?? 'http://localhost:3007',
    documentStorageService: process.env.DOCUMENT_STORAGE_SERVICE_URL ?? 'http://localhost:3009',
  },
  queues: {
    jobLifecycle:
      process.env.APPLICATION_SERVICE_JOB_LIFECYCLE_QUEUE ?? 'application.job-lifecycle',
    matchingCompleted:
      process.env.APPLICATION_SERVICE_MATCHING_COMPLETED_QUEUE ??
      'application.matching-completed',
    cvParsed: process.env.APPLICATION_SERVICE_CV_PARSED_QUEUE ?? 'application.cv-parsed',
  },
}));
