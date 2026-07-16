import { registerAs } from '@nestjs/config';

export const companyServiceConfig = registerAs('companyService', () => ({
  port: parseInt(process.env.COMPANY_SERVICE_PORT ?? '3003', 10),
  services: {
    documentStorageService: process.env.DOCUMENT_STORAGE_SERVICE_URL ?? 'http://localhost:3009',
  },
  http: {
    timeoutMs: parseInt(process.env.COMPANY_SERVICE_HTTP_TIMEOUT_MS ?? '30000', 10),
  },
  queues: {
    jobReviewTrustSignal:
      process.env.COMPANY_SERVICE_JOB_REVIEW_TRUST_SIGNAL_QUEUE ??
      'company.job-review-trust-signal',
  },
}));
