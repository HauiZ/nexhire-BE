import * as Joi from 'joi';

/** Fail-fast validation of the gateway's required env vars. */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  GATEWAY_PORT: Joi.number().default(3000),
  FRONTEND_URL: Joi.string().uri().required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  AUTH_SERVICE_URL: Joi.string().uri().required(),
  CANDIDATE_SERVICE_URL: Joi.string().uri().required(),
  COMPANY_SERVICE_URL: Joi.string().uri().required(),
  JOB_SERVICE_URL: Joi.string().uri().required(),
  APPLICATION_SERVICE_URL: Joi.string().uri().required(),
  CV_PARSING_SERVICE_URL: Joi.string().uri().required(),
  MATCHING_SERVICE_URL: Joi.string().uri().required(),
  NOTIFICATION_SERVICE_URL: Joi.string().uri().required(),
  DOCUMENT_STORAGE_SERVICE_URL: Joi.string().uri().required(),
});
