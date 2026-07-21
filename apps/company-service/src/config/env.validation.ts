import * as Joi from 'joi';
import { QUEUES } from '@nexhire/shared';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  COMPANY_SERVICE_PORT: Joi.number().default(3003),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  COMPANY_SERVICE_DB_NAME: Joi.string().required(),
  COMPANY_SERVICE_DB_USER: Joi.string().required(),
  COMPANY_SERVICE_DB_PASS: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  INTERNAL_SERVICE_TOKEN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('dev-internal-service-token'),
  }),
  RABBITMQ_URL: Joi.string().uri().default('amqp://nexhire:nexhire@localhost:5672'),
  RABBITMQ_EXCHANGE: Joi.string().default('nexhire.events'),
  DOCUMENT_STORAGE_SERVICE_URL: Joi.string().uri().default('http://localhost:3009'),
  COMPANY_SERVICE_HTTP_TIMEOUT_MS: Joi.number().default(30000),
  COMPANY_SERVICE_JOB_REVIEW_TRUST_SIGNAL_QUEUE: Joi.string().default(
    QUEUES.COMPANY_JOB_REVIEW_TRUST_SIGNAL,
  ),
});
