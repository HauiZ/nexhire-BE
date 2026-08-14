import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  CANDIDATE_SERVICE_PORT: Joi.number().default(3002),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  CANDIDATE_SERVICE_DB_NAME: Joi.string().required(),
  CANDIDATE_SERVICE_DB_USER: Joi.string().required(),
  CANDIDATE_SERVICE_DB_PASS: Joi.string().required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).allow('').optional(),
  REDIS_HOST: Joi.string().when('REDIS_URL', {
    is: Joi.string().min(1).required(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
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
  APPLICATION_SERVICE_URL: Joi.string().uri().default('http://localhost:3005'),
  COMPANY_SERVICE_URL: Joi.string().uri().default('http://localhost:3003'),
  JOB_SERVICE_URL: Joi.string().uri().default('http://localhost:3004'),
  CANDIDATE_SERVICE_HTTP_TIMEOUT_MS: Joi.number().default(30000),
  CV_DOCUMENT_CLEANUP_SWEEP_INTERVAL_MS: Joi.number().min(60000).default(3600000),
  CV_DOCUMENT_CLEANUP_DELETED_GRACE_DAYS: Joi.number().min(1).default(30),
  CV_DOCUMENT_CLEANUP_TERMINAL_APPLICATION_RETENTION_DAYS: Joi.number().min(1).default(180),
  CV_DOCUMENT_CLEANUP_BATCH_SIZE: Joi.number().min(1).max(500).default(50),
});
