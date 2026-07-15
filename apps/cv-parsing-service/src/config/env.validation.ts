import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  CV_PARSING_SERVICE_PORT: Joi.number().default(3006),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  CV_PARSING_SERVICE_DB_NAME: Joi.string().required(),
  CV_PARSING_SERVICE_DB_USER: Joi.string().required(),
  CV_PARSING_SERVICE_DB_PASS: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  INTERNAL_SERVICE_TOKEN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('dev-internal-service-token'),
  }),
  GEMINI_API_KEY: Joi.string().required(),
  GEMINI_MODEL: Joi.string().default('gemini-1.5-flash'),
  SKIMA_API_KEY: Joi.string().allow('').optional(),
  SKIMA_BASE_URL: Joi.string().uri().default('https://api.skima.ai'),
  SKIMA_PARSE_PATH: Joi.string().default('/resume/parse'),
  SKIMA_TIMEOUT_MS: Joi.number().default(30000),
  SKIMA_PROVIDER_VERSION: Joi.string().allow('').optional(),
  SKIMA_PERSIST_RAW_PAYLOAD: Joi.boolean().default(false),
  CANDIDATE_SERVICE_URL: Joi.string().uri().default('http://localhost:3002'),
  CV_PARSING_SERVICE_HTTP_TIMEOUT_MS: Joi.number().default(30000),
});
