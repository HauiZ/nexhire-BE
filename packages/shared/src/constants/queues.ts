/**
 * Default RabbitMQ queue names for service consumers.
 * Env vars may override these per environment, but local/dev should work without extra config.
 */
export const QUEUES = {
  AUTH_COMPANY_LINK: 'auth.company-link',
  AUTH_CANDIDATE_PROFILE: 'auth.candidate-profile',
  COMPANY_JOB_REVIEW_TRUST_SIGNAL: 'company.job-review-trust-signal',
  JOB_COMPANY_SNAPSHOT: 'job.company-snapshot',
  JOB_APPLICATION_SUBMITTED: 'job.application-submitted',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
