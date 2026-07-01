import { registerAs } from '@nestjs/config';

export const companyServiceConfig = registerAs('companyService', () => ({
  port: parseInt(process.env.COMPANY_SERVICE_PORT ?? '3003', 10),
}));
