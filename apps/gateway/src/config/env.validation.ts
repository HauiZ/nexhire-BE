import * as Joi from 'joi';

/** Fail-fast validation of the gateway's required env vars. */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  GATEWAY_PORT: Joi.number().default(3000),
  FRONTEND_URL: Joi.string().uri().required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  AUTH_SERVICE_URL: Joi.string().uri().required(),
  JOB_SERVICE_URL: Joi.string().uri().required(),
  CVAPP_SERVICE_URL: Joi.string().uri().required(),
  AI_SERVICE_URL: Joi.string().uri().required(),
  NOTIF_SERVICE_URL: Joi.string().uri().required(),
});
