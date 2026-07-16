import { registerAs } from '@nestjs/config';

export const companyServiceConfig = registerAs('companyService', () => ({
  port: parseInt(process.env.COMPANY_SERVICE_PORT ?? '3003', 10),
  queues: {
    jobReviewTrustSignal:
      process.env.COMPANY_SERVICE_JOB_REVIEW_TRUST_SIGNAL_QUEUE ??
      'company.job-review-trust-signal',
  },
}));
