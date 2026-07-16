import { registerAs } from '@nestjs/config';

export const candidateServiceConfig = registerAs('candidateService', () => ({
  port: parseInt(process.env.CANDIDATE_SERVICE_PORT ?? '3002', 10),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-service-token',
  services: {
    authService: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001',
    documentStorageService: process.env.DOCUMENT_STORAGE_SERVICE_URL ?? 'http://localhost:3009',
    cvParsingService: process.env.CV_PARSING_SERVICE_URL ?? 'http://localhost:3006',
    applicationService: process.env.APPLICATION_SERVICE_URL ?? 'http://localhost:3005',
    jobService: process.env.JOB_SERVICE_URL ?? 'http://localhost:3004',
  },
  http: {
    timeoutMs: parseInt(process.env.CANDIDATE_SERVICE_HTTP_TIMEOUT_MS ?? '30000', 10),
  },
  cvCleanup: {
    sweepIntervalMs: parseInt(process.env.CV_DOCUMENT_CLEANUP_SWEEP_INTERVAL_MS ?? '3600000', 10),
    deletedGraceDays: parseInt(process.env.CV_DOCUMENT_CLEANUP_DELETED_GRACE_DAYS ?? '30', 10),
    terminalApplicationRetentionDays: parseInt(
      process.env.CV_DOCUMENT_CLEANUP_TERMINAL_APPLICATION_RETENTION_DAYS ?? '180',
      10,
    ),
    batchSize: parseInt(process.env.CV_DOCUMENT_CLEANUP_BATCH_SIZE ?? '50', 10),
  },
}));
