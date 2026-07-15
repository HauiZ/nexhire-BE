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
  RABBITMQ_URL: Joi.string().uri().default('amqp://nexhire:nexhire@localhost:5672'),
  RABBITMQ_EXCHANGE: Joi.string().default('nexhire.events'),
  JOB_SERVICE_COMPANY_SNAPSHOT_QUEUE: Joi.string().default('job.company-snapshot'),
  JOB_SERVICE_APPLICATION_SUBMITTED_QUEUE: Joi.string().default('job.application-submitted'),
});
