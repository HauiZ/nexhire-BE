import { registerAs } from '@nestjs/config';

export const cvappConfig = registerAs('cvapp', () => ({
  port: parseInt(process.env.CVAPP_PORT ?? '3003', 10),
  services: {
    job: process.env.JOB_SERVICE_URL ?? 'http://localhost:3002',
    ai: process.env.AI_SERVICE_URL ?? 'http://localhost:3004',
    auth: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001',
  },
  // MinIO/storage config now lives in @nexhire/infra (storageConfig); the
  // CV feature will load it + import StorageModule when built.
}));
