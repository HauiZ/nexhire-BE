import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  JOB_SERVICE_PORT: Joi.number().default(3004),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  JOB_SERVICE_DB_NAME: Joi.string().required(),
  JOB_SERVICE_DB_USER: Joi.string().required(),
  JOB_SERVICE_DB_PASS: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  INTERNAL_SERVICE_TOKEN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('dev-internal-service-token'),
  }),
  RABBITMQ_URL: Joi.string().uri().default('amqp://nexhire:nexhire@localhost:5672'),
  RABBITMQ_EXCHANGE: Joi.string().default('nexhire.events'),
  JOB_SERVICE_COMPANY_SNAPSHOT_QUEUE: Joi.string().default('job.company-snapshot'),
  JOB_SERVICE_APPLICATION_SUBMITTED_QUEUE: Joi.string().default('job.application-submitted'),
  JOB_EXPIRATION_SWEEP_INTERVAL_MS: Joi.number().min(10000).default(300000),
  COMPANY_SERVICE_URL: Joi.string().uri().default('http://localhost:3003'),
  JOB_SERVICE_HTTP_TIMEOUT_MS: Joi.number().default(5000),
});
