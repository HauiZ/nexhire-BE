import * as Joi from 'joi';
import { QUEUES } from '@nexhire/shared';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  JOB_SERVICE_PORT: Joi.number().default(3004),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_POOL_MAX: Joi.number().integer().min(1).default(3),
  DB_POOL_IDLE_TIMEOUT_MS: Joi.number().integer().min(1000).default(10000),
  DB_POOL_CONNECTION_TIMEOUT_MS: Joi.number().integer().min(1000).default(5000),
  JOB_SERVICE_DB_NAME: Joi.string().required(),
  JOB_SERVICE_DB_USER: Joi.string().required(),
  JOB_SERVICE_DB_PASS: Joi.string().required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).allow('').optional(),
  REDIS_HOST: Joi.string().when('REDIS_URL', {
    is: Joi.string().min(1).required(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  REDIS_PORT: Joi.number().default(6379),
  INTERNAL_SERVICE_TOKEN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('dev-internal-service-token'),
  }),
  RABBITMQ_URL: Joi.string().uri().default('amqp://nexhire:nexhire@localhost:5672'),
  RABBITMQ_EXCHANGE: Joi.string().default('nexhire.events'),
  JOB_SERVICE_COMPANY_SNAPSHOT_QUEUE: Joi.string().default(QUEUES.JOB_COMPANY_SNAPSHOT),
  JOB_SERVICE_APPLICATION_SUBMITTED_QUEUE: Joi.string().default(QUEUES.JOB_APPLICATION_SUBMITTED),
  JOB_EXPIRATION_SWEEP_INTERVAL_MS: Joi.number().min(10000).default(300000),
  COMPANY_SERVICE_URL: Joi.string().uri().default('http://localhost:3003'),
  DOCUMENT_STORAGE_SERVICE_URL: Joi.string().uri().default('http://localhost:3009'),
  JOB_SERVICE_HTTP_TIMEOUT_MS: Joi.number().default(5000),
});
