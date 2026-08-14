import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  DOCUMENT_STORAGE_SERVICE_PORT: Joi.number().default(3009),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DOCUMENT_STORAGE_SERVICE_DB_NAME: Joi.string().required(),
  DOCUMENT_STORAGE_SERVICE_DB_USER: Joi.string().required(),
  DOCUMENT_STORAGE_SERVICE_DB_PASS: Joi.string().required(),
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
  STORAGE_ENDPOINT: Joi.string(),
  STORAGE_ACCESS_KEY: Joi.string(),
  STORAGE_SECRET_KEY: Joi.string(),
  STORAGE_BUCKET_NAME: Joi.string(),
  STORAGE_REGION: Joi.string().default('us-east-1'),
  STORAGE_FORCE_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(true),
  MINIO_ENDPOINT: Joi.string().when('STORAGE_ENDPOINT', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  MINIO_PORT: Joi.number().default(9000),
  MINIO_USE_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  MINIO_ACCESS_KEY: Joi.string().when('STORAGE_ACCESS_KEY', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  MINIO_SECRET_KEY: Joi.string().when('STORAGE_SECRET_KEY', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  MINIO_BUCKET: Joi.string().when('STORAGE_BUCKET_NAME', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
});
