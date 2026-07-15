import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  APPLICATION_SERVICE_PORT: Joi.number().default(3005),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  APPLICATION_SERVICE_DB_NAME: Joi.string().required(),
  APPLICATION_SERVICE_DB_USER: Joi.string().required(),
  APPLICATION_SERVICE_DB_PASS: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  RABBITMQ_URL: Joi.string().required(),
  RABBITMQ_EXCHANGE: Joi.string().default('nexhire.events'),
  INTERNAL_SERVICE_TOKEN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('dev-internal-service-token'),
  }),
  APPLICATION_SERVICE_HTTP_TIMEOUT_MS: Joi.number().default(5000),
  CANDIDATE_SERVICE_URL: Joi.string().default('http://localhost:3002'),
  JOB_SERVICE_URL: Joi.string().default('http://localhost:3004'),
  DOCUMENT_STORAGE_SERVICE_URL: Joi.string().default('http://localhost:3009'),
  APPLICATION_SERVICE_JOB_LIFECYCLE_QUEUE: Joi.string().default('application.job-lifecycle'),
});
