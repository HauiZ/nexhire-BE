import { registerAs } from '@nestjs/config';

export const notificationServiceConfig = registerAs('notificationService', () => ({
  port: parseInt(process.env.NOTIFICATION_SERVICE_PORT ?? '3008', 10),
  smtp: {
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM ?? 'NexHire <noreply@nexhire.vn>',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
}));
