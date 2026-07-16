import * as Joi from 'joi';

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
  COMPANY_SERVICE_JOB_REVIEW_TRUST_SIGNAL_QUEUE: Joi.string().default(
    'company.job-review-trust-signal',
  ),
});
