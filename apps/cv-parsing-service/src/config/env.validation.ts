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
  GEMINI_API_KEY: Joi.string().required(),
  GEMINI_MODEL: Joi.string().default('gemini-1.5-flash'),
});
