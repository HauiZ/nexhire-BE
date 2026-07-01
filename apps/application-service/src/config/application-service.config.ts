import { registerAs } from '@nestjs/config';

export const applicationServiceConfig = registerAs('applicationService', () => ({
  port: parseInt(process.env.APPLICATION_SERVICE_PORT ?? '3005', 10),
}));
