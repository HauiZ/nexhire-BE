import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  AUTH_SERVICE_PORT: Joi.number().default(3001),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  AUTH_SERVICE_DB_NAME: Joi.string().required(),
  AUTH_SERVICE_DB_USER: Joi.string().required(),
  AUTH_SERVICE_DB_PASS: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.number().default(900),
  JWT_REFRESH_TTL: Joi.number().default(604800),
  RABBITMQ_URL: Joi.string().uri({ scheme: ['amqp', 'amqps'] }).optional(),
  RABBITMQ_EXCHANGE: Joi.string().default('nexhire.events'),
  EMAIL_VERIFICATION_TOKEN_LENGTH: Joi.number().integer().min(4).max(10).default(6),
  EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: Joi.number().integer().min(1).max(1440).default(15),
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: Joi.number().integer().min(10).max(3600).default(60),
  EMAIL_VERIFICATION_MAX_RESENDS: Joi.number().integer().min(1).max(20).default(5),
});
