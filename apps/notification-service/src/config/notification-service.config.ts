import { registerAs } from '@nestjs/config';

export const notificationServiceConfig = registerAs('notificationService', () => ({
  port: parseInt(process.env.NOTIFICATION_SERVICE_PORT ?? '3008', 10),
  smtp: {
    host: process.env.SMTP_HOST ?? process.env.MAILTRAP_SMTP_HOST ?? 'sandbox.smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT ?? process.env.MAILTRAP_SMTP_PORT ?? '2525', 10),
    secure: (process.env.SMTP_SECURE ?? process.env.MAILTRAP_SMTP_SECURE ?? 'false') === 'true',
    user: process.env.SMTP_USER ?? process.env.MAILTRAP_SMTP_USER,
    pass: process.env.SMTP_PASS ?? process.env.MAILTRAP_SMTP_PASS,
    from: process.env.SMTP_FROM ?? 'NexHire <noreply@nexhire.vn>',
  },
  queues: {
    emailVerification:
      process.env.NOTIFICATION_QUEUE_EMAIL_VERIFICATION ?? 'notification.email.verification',
    passwordReset:
      process.env.NOTIFICATION_QUEUE_PASSWORD_RESET ?? 'notification.email.password-reset',
    inAppApplication:
      process.env.NOTIFICATION_QUEUE_IN_APP_APPLICATION ?? 'notification.in-app.application',
  },
  frontend: {
    url: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    verifyEmailPath: process.env.FRONTEND_VERIFY_EMAIL_PATH ?? '/verify-email',
    resetPasswordPath: process.env.FRONTEND_RESET_PASSWORD_PATH ?? '/reset-password',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
}));
