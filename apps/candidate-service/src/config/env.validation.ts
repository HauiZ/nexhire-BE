import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  CANDIDATE_SERVICE_PORT: Joi.number().default(3002),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  CANDIDATE_SERVICE_DB_NAME: Joi.string().required(),
  CANDIDATE_SERVICE_DB_USER: Joi.string().required(),
  CANDIDATE_SERVICE_DB_PASS: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .optional(),
  RABBITMQ_EXCHANGE: Joi.string().default('nexhire.events'),
  INTERNAL_SERVICE_TOKEN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('dev-internal-service-token'),
  }),
  AUTH_SERVICE_URL: Joi.string().uri().default('http://localhost:3001'),
  DOCUMENT_STORAGE_SERVICE_URL: Joi.string().uri().default('http://localhost:3009'),
  CV_PARSING_SERVICE_URL: Joi.string().uri().default('http://localhost:3006'),
  JOB_SERVICE_URL: Joi.string().uri().default('http://localhost:3004'),
  CANDIDATE_SERVICE_HTTP_TIMEOUT_MS: Joi.number().default(30000),
});
