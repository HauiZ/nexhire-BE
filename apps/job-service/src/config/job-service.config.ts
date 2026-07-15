import { registerAs } from '@nestjs/config';

export const jobServiceConfig = registerAs('jobService', () => ({
  port: parseInt(process.env.JOB_SERVICE_PORT ?? '3004', 10),
  queues: {
    companySnapshot: process.env.JOB_SERVICE_COMPANY_SNAPSHOT_QUEUE ?? 'job.company-snapshot',
    applicationSubmitted:
      process.env.JOB_SERVICE_APPLICATION_SUBMITTED_QUEUE ?? 'job.application-submitted',
  },
}));
