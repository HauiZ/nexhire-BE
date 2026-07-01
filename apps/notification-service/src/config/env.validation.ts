import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  NOTIFICATION_SERVICE_PORT: Joi.number().default(3008),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  RABBITMQ_URL: Joi.string().uri({ scheme: ['amqp', 'amqps'] }).optional(),
  RABBITMQ_EXCHANGE: Joi.string().default('nexhire.events'),
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().optional(),
  SMTP_SECURE: Joi.boolean().optional(),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  MAILTRAP_SMTP_HOST: Joi.string().default('sandbox.smtp.mailtrap.io'),
  MAILTRAP_SMTP_PORT: Joi.number().default(2525),
  MAILTRAP_SMTP_SECURE: Joi.boolean().default(false),
  MAILTRAP_SMTP_USER: Joi.string().optional(),
  MAILTRAP_SMTP_PASS: Joi.string().optional(),
  SMTP_FROM: Joi.string().default('NexHire <noreply@nexhire.vn>'),
  NOTIFICATION_QUEUE_EMAIL_VERIFICATION: Joi.string().default('notification.email.verification'),
  NOTIFICATION_QUEUE_PASSWORD_RESET: Joi.string().default('notification.email.password-reset'),
});
