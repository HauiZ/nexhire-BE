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
  APPLICATION_CV_VIEWED: 'application.cv-viewed',
  USER_LIFECYCLE_CHANGED: 'user.lifecycle-changed',
  CV_UPLOADED: 'cv.uploaded',
  CV_PARSED: 'cv.parsed',
  CV_PARSE_FAILED: 'cv.parse-failed',
  CV_MATCH_REQUESTED: 'cv.match-requested',
  MATCHING_COMPLETED: 'matching.completed',
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_REMOVED: 'document.removed',
  CANDIDATE_PROFILE_SNAPSHOT_CHANGED: 'candidate.profile-snapshot-changed',
  COMPANY_POSTING_SNAPSHOT_CHANGED: 'company.posting-snapshot-changed',
  COMPANY_REVIEW_REQUIRED: 'company.review-required',
  COMPANY_FOLLOWED_JOB_PUBLISHED: 'company-follow.job-published',
  JOB_REVIEW_TRUST_SIGNAL: 'job.review-trust-signal',
  JOB_REVIEW_REQUIRED: 'job.review-required',
  JOB_REVIEW_RESULT_CHANGED: 'job.review-result-changed',
  JOB_REVISION_REVIEW_REQUIRED: 'job-revision.review-required',
  JOB_REVISION_REVIEW_RESULT_CHANGED: 'job-revision.review-result-changed',
  JOB_PUBLISHED: 'job.published',
  JOB_UNPUBLISHED: 'job.unpublished',
  JOB_CLOSED: 'job.closed',
  JOB_REVISION_APPROVED: 'job.revision-approved',
} as const;

export type EventRoutingKey = (typeof EVENTS)[keyof typeof EVENTS];
