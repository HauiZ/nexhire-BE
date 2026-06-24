import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  JOB_PORT: Joi.number().default(3002),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  JOB_DB_NAME: Joi.string().required(),
  JOB_DB_USER: Joi.string().required(),
  JOB_DB_PASS: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
});
