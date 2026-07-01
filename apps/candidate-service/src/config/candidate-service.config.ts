import { registerAs } from '@nestjs/config';

export const candidateServiceConfig = registerAs('candidateService', () => ({
  port: parseInt(process.env.CANDIDATE_SERVICE_PORT ?? '3002', 10),
}));
