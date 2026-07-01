import { registerAs } from '@nestjs/config';

export const jobServiceConfig = registerAs('jobService', () => ({
  port: parseInt(process.env.JOB_SERVICE_PORT ?? '3004', 10),
}));
