import { registerAs } from '@nestjs/config';

export const gatewayConfig = registerAs('gateway', () => ({
  port: parseInt(process.env.GATEWAY_PORT ?? '3000', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
  },
  services: {
    auth: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001',
    job: process.env.JOB_SERVICE_URL ?? 'http://localhost:3002',
    cvApp: process.env.CVAPP_SERVICE_URL ?? 'http://localhost:3003',
    ai: process.env.AI_SERVICE_URL ?? 'http://localhost:3004',
    notification: process.env.NOTIF_SERVICE_URL ?? 'http://localhost:3005',
  },
}));
