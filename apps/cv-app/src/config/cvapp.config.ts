import { registerAs } from '@nestjs/config';

export const cvappConfig = registerAs('cvapp', () => ({
  port: parseInt(process.env.CVAPP_PORT ?? '3003', 10),
  services: {
    job: process.env.JOB_SERVICE_URL ?? 'http://localhost:3002',
    ai: process.env.AI_SERVICE_URL ?? 'http://localhost:3004',
    auth: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001',
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
    useSsl: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
    bucket: process.env.MINIO_BUCKET ?? 'nexhire',
  },
}));
