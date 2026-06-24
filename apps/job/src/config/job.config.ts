import { registerAs } from '@nestjs/config';

export const jobConfig = registerAs('job', () => ({
  port: parseInt(process.env.JOB_PORT ?? '3002', 10),
}));
