import { registerAs } from '@nestjs/config';
import { QUEUES } from '@nexhire/shared';

export const jobServiceConfig = registerAs('jobService', () => ({
  port: parseInt(process.env.JOB_SERVICE_PORT ?? '3004', 10),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-service-token',
  queues: {
    companySnapshot: process.env.JOB_SERVICE_COMPANY_SNAPSHOT_QUEUE ?? QUEUES.JOB_COMPANY_SNAPSHOT,
    applicationSubmitted:
      process.env.JOB_SERVICE_APPLICATION_SUBMITTED_QUEUE ?? QUEUES.JOB_APPLICATION_SUBMITTED,
  },
  expiration: {
    sweepIntervalMs: parseInt(process.env.JOB_EXPIRATION_SWEEP_INTERVAL_MS ?? '300000', 10),
  },
  services: {
    companyService: process.env.COMPANY_SERVICE_URL ?? 'http://localhost:3003',
    documentStorageService: process.env.DOCUMENT_STORAGE_SERVICE_URL ?? 'http://localhost:3009',
  },
  http: {
    timeoutMs: parseInt(process.env.JOB_SERVICE_HTTP_TIMEOUT_MS ?? '5000', 10),
  },
}));
