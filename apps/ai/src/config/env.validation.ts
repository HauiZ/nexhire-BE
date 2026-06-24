import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  AI_PORT: Joi.number().default(3004),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  AI_DB_NAME: Joi.string().required(),
  AI_DB_USER: Joi.string().required(),
  AI_DB_PASS: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  GEMINI_API_KEY: Joi.string().required(),
  GEMINI_MODEL: Joi.string().default('gemini-1.5-flash'),
});
