import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  MATCHING_SERVICE_PORT: Joi.number().default(3007),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  MATCHING_SERVICE_DB_NAME: Joi.string().required(),
  MATCHING_SERVICE_DB_USER: Joi.string().required(),
  MATCHING_SERVICE_DB_PASS: Joi.string().required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).allow('').optional(),
  REDIS_HOST: Joi.string().when('REDIS_URL', {
    is: Joi.string().min(1).required(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  REDIS_PORT: Joi.number().default(6379),
  GEMINI_API_KEY: Joi.string().allow('').optional(),
  GEMINI_MODEL: Joi.string().default('gemini-1.5-flash'),
  SKIMA_API_KEY: Joi.string().allow('').optional(),
  SKIMA_BASE_URL: Joi.string().uri().default('https://api.skima.ai'),
  SKIMA_TIMEOUT_MS: Joi.number().default(30000),
  SKIMA_PROVIDER_VERSION: Joi.string().allow('').optional(),
});
