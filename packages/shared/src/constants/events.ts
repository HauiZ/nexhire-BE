/**
 * Domain event routing keys (topics) published to the RabbitMQ exchange.
 * Producers publish with these keys; consumers bind queues to them.
 * Format: '<aggregate>.<event>' (dotted, lower-case) for topic matching.
 */
export const EVENTS = {
  AUTH_EMAIL_VERIFICATION_REQUESTED: 'auth.email-verification-requested',
  AUTH_PASSWORD_RESET_REQUESTED: 'auth.password-reset-requested',
  APPLICATION_SUBMITTED: 'application.submitted',
  APPLICATION_STAGE_CHANGED: 'application.stage-changed',
  CV_UPLOADED: 'cv.uploaded',
  CV_PARSED: 'cv.parsed',
  CV_MATCH_REQUESTED: 'cv.match-requested',
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_REMOVED: 'document.removed',
  COMPANY_POSTING_SNAPSHOT_CHANGED: 'company.posting-snapshot-changed',
  JOB_PUBLISHED: 'job.published',
  JOB_REVISION_APPROVED: 'job.revision-approved',
} as const;

export type EventRoutingKey = (typeof EVENTS)[keyof typeof EVENTS];
