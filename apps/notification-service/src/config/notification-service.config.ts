import { registerAs } from '@nestjs/config';
import { QUEUES } from '@nexhire/shared';

const env = (key: string, fallback?: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : fallback;
};

const envNumber = (key: string, fallback: string): number => parseInt(env(key, fallback)!, 10);

export const notificationServiceConfig = registerAs('notificationService', () => ({
  port: envNumber('NOTIFICATION_SERVICE_PORT', '3008'),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN,
  http: {
    timeoutMs: envNumber('NOTIFICATION_SERVICE_HTTP_TIMEOUT_MS', '5000'),
  },
  services: {
    authService: env('AUTH_SERVICE_URL', 'http://localhost:3001'),
  },
  smtp: {
    host: env('SMTP_HOST', 'smtp.gmail.com'),
    port: parseInt(env('SMTP_PORT', '587')!, 10),
    secure: env('SMTP_SECURE', 'false') === 'true',
    user: env('SMTP_USER', env('MAILTRAP_SMTP_USER')),
    pass: env('SMTP_PASS', env('MAILTRAP_SMTP_PASS')),
    from: env('SMTP_FROM', 'NexHire <noreply@nexhire.vn>'),
  },
  queues: {
    emailVerification:
      process.env.NOTIFICATION_QUEUE_EMAIL_VERIFICATION ?? 'notification.email.verification',
    passwordReset:
      process.env.NOTIFICATION_QUEUE_PASSWORD_RESET ?? 'notification.email.password-reset',
    inAppApplication:
      process.env.NOTIFICATION_QUEUE_IN_APP_APPLICATION ?? QUEUES.NOTIFICATION_IN_APP,
  },
  frontend: {
    url: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    verifyEmailPath: process.env.FRONTEND_VERIFY_EMAIL_PATH ?? '/verify-email',
    resetPasswordPath: process.env.FRONTEND_RESET_PASSWORD_PATH ?? '/reset-password',
  },
  redis: {
    host: env('REDIS_HOST', 'localhost'),
    port: envNumber('REDIS_PORT', '6379'),
  },
  queueMonitor: {
    enabled: process.env.QUEUE_MONITOR_ENABLED === 'true',
    intervalMs: envNumber('QUEUE_MONITOR_INTERVAL_MS', '60000'),
    alertThreshold: envNumber('QUEUE_MONITOR_ALERT_THRESHOLD', '100'),
    alertCooldownMs: envNumber('QUEUE_MONITOR_ALERT_COOLDOWN_MS', '900000'),
    dlqAlertThreshold: envNumber('QUEUE_MONITOR_DLQ_ALERT_THRESHOLD', '1'),
    dlqAlertCooldownMs: envNumber('QUEUE_MONITOR_DLQ_ALERT_COOLDOWN_MS', '1800000'),
    noConsumerAlertThreshold: envNumber('QUEUE_MONITOR_NO_CONSUMER_ALERT_THRESHOLD', '10'),
    noConsumerAlertCooldownMs: envNumber('QUEUE_MONITOR_NO_CONSUMER_ALERT_COOLDOWN_MS', '600000'),
    queues: process.env.QUEUE_MONITOR_QUEUES?.trim()
      ? process.env.QUEUE_MONITOR_QUEUES.split(',')
          .map((queue) => queue.trim())
          .filter(Boolean)
      : undefined,
    testQueue: env('QUEUE_MONITOR_TEST_QUEUE', 'queue-monitor.test-backlog'),
    includeTestQueue:
      process.env.QUEUE_MONITOR_INCLUDE_TEST_QUEUE !== undefined
        ? process.env.QUEUE_MONITOR_INCLUDE_TEST_QUEUE === 'true'
        : Boolean(process.env.QUEUE_MONITOR_TEST_QUEUE?.trim()) ||
          process.env.NODE_ENV !== 'production',
    rabbitManagementUrl: env(
      'RABBITMQ_MANAGEMENT_URL',
      env('RABBITMQ_HTTP_URL', 'http://localhost:15672'),
    ),
    rabbitManagementVhost: env('RABBITMQ_MANAGEMENT_VHOST', '/'),
    rabbitManagementUser: env('RABBITMQ_MANAGEMENT_USER', env('RABBITMQ_USER', 'nexhire')),
    rabbitManagementPass: env('RABBITMQ_MANAGEMENT_PASS', env('RABBITMQ_PASS', 'nexhire')),
    telegramBotToken: env('TELEGRAM_BOT_TOKEN'),
    telegramChatId: env('TELEGRAM_CHAT_ID'),
  },
}));
