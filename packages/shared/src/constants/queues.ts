/** BullMQ queue names — used by producers and processors. */
export const QUEUES = {
  AI_PARSE_CV: 'ai.parse-cv',
  AI_MATCH: 'ai.match',
  NOTIFICATION_SEND: 'notification.send',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
