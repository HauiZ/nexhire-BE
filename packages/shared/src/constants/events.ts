/**
 * Domain event routing keys (topics) published to the RabbitMQ exchange.
 * Producers publish with these keys; consumers bind queues to them.
 * Format: '<aggregate>.<event>' (dotted, lower-case) for topic matching.
 */
export const EVENTS = {
  APPLICATION_SUBMITTED: 'application.submitted',
  APPLICATION_STAGE_CHANGED: 'application.stage-changed',
  CV_UPLOADED: 'cv.uploaded',
  CV_PARSED: 'cv.parsed',
  CV_MATCH_REQUESTED: 'cv.match-requested',
} as const;

export type EventRoutingKey = (typeof EVENTS)[keyof typeof EVENTS];
