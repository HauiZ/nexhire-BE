# RabbitMQ Event Bus

RabbitMQ uses a durable topic exchange from `rabbitmq.exchange` with dotted routing keys from `packages/shared/src/constants/events.ts`.

## Events

| Routing key                          | Producer            | Consumer(s)                                     | Purpose                                                                          |
| ------------------------------------ | ------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `auth.email-verification-requested`  | auth-service        | notification-service email                      | Send verification email.                                                         |
| `auth.password-reset-requested`      | auth-service        | notification-service email                      | Send password reset email.                                                       |
| `application.submitted`              | application-service | job-service, notification-service               | Increment application count and notify.                                          |
| `application.stage-changed`          | application-service | notification-service                            | Notify candidate about stage changes.                                            |
| `application.cv-viewed`              | application-service | notification-service                            | Notify candidate when recruiter views CV for the first time.                     |
| `user.lifecycle-changed`             | auth-service        | notification-service in-app/email               | Notify affected user when admin changes account lifecycle status.                |
| `cv.uploaded`                        | candidate-service   | cv-parsing-service                              | Start async profile CV parsing.                                                  |
| `cv.parsed`                          | cv-parsing-service  | candidate-service, application-service          | Apply parsed resume, mark CV parsed, and continue waiting matching.              |
| `cv.parse-failed`                    | cv-parsing-service  | candidate-service, application-service          | Mark CV parse failed and unblock waiting matching state.                         |
| `cv.match-requested`                 | reserved            | none currently                                  | Reserved for async matching flow; matching requests currently use internal HTTP. |
| `matching.completed`                 | matching-service    | application-service                             | Report terminal matching success/failure for application score sync.             |
| `document.uploaded`                  | reserved            | none currently                                  | Reserved for document lifecycle.                                                 |
| `document.removed`                   | reserved            | none currently                                  | Reserved for document lifecycle.                                                 |
| `candidate.profile-snapshot-changed` | candidate-service   | auth-service, application-service               | Sync candidate profile snapshot.                                                 |
| `company.posting-snapshot-changed`   | company-service     | auth-service, job-service, notification-service | Sync company posting/read snapshots and notify verification changes.             |
| `company-follow.job-published`       | candidate-service   | notification-service                            | Notify followers about newly published jobs.                                     |
| `job.review-trust-signal`            | job-service         | company-service                                 | Feed company trust signals from job moderation.                                  |
| `job.review-result-changed`          | job-service         | notification-service                            | Notify recruiter company when admin approves or rejects a job.                   |
| `job-revision.review-result-changed` | job-service         | notification-service                            | Notify recruiter company when admin approves or rejects a revision.              |
| `job.published`                      | job-service         | candidate-service                               | Build followed-company notification fanout.                                      |
| `job.unpublished`                    | job-service         | application-service                             | Cancel/handle applications for unavailable job.                                  |
| `job.closed`                         | job-service         | application-service                             | Cancel/handle applications for closed job.                                       |
| `job.revision-approved`              | job-service         | none currently                                  | Reserved for downstream revision reactions.                                      |

## Queues

| Queue                               | Service              | Bound routing keys                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.company-link`                 | auth-service         | `company.posting-snapshot-changed`                                                                                                                                                                                                                                                                                               |
| `auth.candidate-profile`            | auth-service         | `candidate.profile-snapshot-changed`                                                                                                                                                                                                                                                                                             |
| `company.job-review-trust-signal`   | company-service      | `job.review-trust-signal`                                                                                                                                                                                                                                                                                                        |
| `job.company-snapshot`              | job-service          | `company.posting-snapshot-changed`                                                                                                                                                                                                                                                                                               |
| `job.application-submitted`         | job-service          | `application.submitted`                                                                                                                                                                                                                                                                                                          |
| `candidate.job-published-follow`    | candidate-service    | `job.published`                                                                                                                                                                                                                                                                                                                  |
| `candidate.cv-parsed`               | candidate-service    | `cv.parsed`, `cv.parse-failed`                                                                                                                                                                                                                                                                                                   |
| `application.cv-parsed`             | application-service  | `cv.parsed`, `cv.parse-failed`                                                                                                                                                                                                                                                                                                   |
| `application.matching-completed`    | application-service  | `matching.completed`                                                                                                                                                                                                                                                                                                             |
| `notification.in-app.application`   | notification-service | `application.submitted`, `application.stage-changed`, `application.cv-viewed`, `company.posting-snapshot-changed`, `company.review-required`, `job.review-required`, `job.review-result-changed`, `job-revision.review-required`, `job-revision.review-result-changed`, `company-follow.job-published`, `user.lifecycle-changed` |
| `notification.email.user-lifecycle` | notification-service | `user.lifecycle-changed`                                                                                                                                                                                                                                                                                                         |
| `cv-parsing.cv-uploaded`            | cv-parsing-service   | `cv.uploaded`                                                                                                                                                                                                                                                                                                                    |

## Delivery Notes

Publishers use persistent messages on a confirm channel with a 5-second confirm timeout and 3 publish attempts. Consumers use durable queues and manual `ack`/`nack`. Event handlers must be idempotent where the side effect can be repeated.

## Event Envelope

Important bus flows should publish an envelope instead of a raw payload:

```json
{
  "eventId": "uuid",
  "eventType": "cv.uploaded",
  "occurredAt": "2026-07-30T05:30:00.000Z",
  "producer": "candidate-service",
  "correlationId": "optional-request-id",
  "causationId": "optional-parent-event-id",
  "data": {}
}
```

Shared helpers live in `packages/shared/src/interfaces/event-envelope.interface.ts`:

- `EventEnvelope<T>`
- `createEventEnvelope(...)`
- `isEventEnvelope(...)`
- `unwrapEventData(...)`

Consumers should use `unwrapEventData(...)` while migrating so old raw messages and new envelope messages are both accepted.

The first migrated envelope flow is:

- `cv.uploaded`
- `cv.parsed`
- `cv.parse-failed`

## Retry and DLQ Topology

Important queues should use the shared RabbitMQ reliability helper from `packages/infra/src/messaging/rabbitmq-reliability.ts`.

For a queue named `<queue>`, the helper creates:

| Queue/exchange              | Purpose                                           |
| --------------------------- | ------------------------------------------------- |
| `<queue>`                   | Main durable consumer queue.                      |
| `<queue>.retry`             | Durable retry queue with TTL delay.               |
| `<queue>.dlq`               | Dead letter queue for messages that exceed retry. |
| `<rabbitmq.exchange>`       | Main topic exchange.                              |
| `<rabbitmq.exchange>.retry` | Retry topic exchange.                             |
| `<rabbitmq.exchange>.dlx`   | Dead letter topic exchange.                       |

Default behavior:

- Retry delay: `10000ms`.
- Max retries: `3`.
- On handler failure below retry limit, message is acked from the main queue and republished to the retry exchange with `x-retry-count`.
- The retry queue dead-letters the message back to the main exchange after TTL.
- After max retries, the consumer publishes the message to the DLX with `x-dead-letter-reason=retry-limit-exceeded`, then acks the original message.

The main queue is declared as durable without adding new queue arguments. This keeps the rollout compatible with queues that already exist in local/dev RabbitMQ.

Currently upgraded queues:

- `cv-parsing.cv-uploaded`
- `candidate.cv-parsed`
- `job.application-submitted`

## Telegram Queue Backlog Alerts

`notification-service` can monitor RabbitMQ queue depth through the RabbitMQ Management API and send Telegram alerts when a queue backlog is too high.

Required environment variables:

| Env                        | Example                  | Purpose                                 |
| -------------------------- | ------------------------ | --------------------------------------- |
| `QUEUE_MONITOR_ENABLED`    | `true`                   | Enables the monitor.                    |
| `TELEGRAM_BOT_TOKEN`       | `123456:abc...`          | Telegram bot token from BotFather.      |
| `TELEGRAM_CHAT_ID`         | `-1001234567890`         | Chat/channel/group id receiving alerts. |
| `RABBITMQ_MANAGEMENT_URL`  | `http://localhost:15672` | RabbitMQ management HTTP API.           |
| `RABBITMQ_MANAGEMENT_USER` | `nexhire`                | Management username.                    |
| `RABBITMQ_MANAGEMENT_PASS` | `nexhire`                | Management password.                    |

Optional environment variables:

| Env                                           | Default             | Purpose                                                                |
| --------------------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `QUEUE_MONITOR_ALERT_THRESHOLD`               | `100`               | Alert when `messages >= threshold`.                                    |
| `QUEUE_MONITOR_INTERVAL_MS`                   | `60000`             | Poll interval.                                                         |
| `QUEUE_MONITOR_ALERT_COOLDOWN_MS`             | `900000`            | Normal backlog per-queue cooldown to avoid alert spam.                 |
| `QUEUE_MONITOR_DLQ_ALERT_THRESHOLD`           | `1`                 | Alert when a `.dlq` queue has at least this many messages.             |
| `QUEUE_MONITOR_DLQ_ALERT_COOLDOWN_MS`         | `1800000`           | DLQ alert cooldown. Default is 30 minutes.                             |
| `QUEUE_MONITOR_NO_CONSUMER_ALERT_THRESHOLD`   | `10`                | Alert when a non-DLQ queue has this many messages and no consumer.     |
| `QUEUE_MONITOR_NO_CONSUMER_ALERT_COOLDOWN_MS` | `600000`            | No-consumer alert cooldown. Default is 10 minutes.                     |
| `QUEUE_MONITOR_QUEUES`                        | all RabbitMQ queues | Comma-separated queue override. Empty means query all queues in vhost. |
| `QUEUE_MONITOR_INCLUDE_TEST_QUEUE`            | non-production only | Include `QUEUE_MONITOR_TEST_QUEUE` in watched queues for demos.        |
| `RABBITMQ_MANAGEMENT_VHOST`                   | `/`                 | RabbitMQ vhost.                                                        |

Example:

```env
QUEUE_MONITOR_ENABLED=true
QUEUE_MONITOR_ALERT_THRESHOLD=100
QUEUE_MONITOR_INTERVAL_MS=60000
QUEUE_MONITOR_ALERT_COOLDOWN_MS=900000
QUEUE_MONITOR_DLQ_ALERT_THRESHOLD=1
QUEUE_MONITOR_DLQ_ALERT_COOLDOWN_MS=1800000
QUEUE_MONITOR_NO_CONSUMER_ALERT_THRESHOLD=10
QUEUE_MONITOR_NO_CONSUMER_ALERT_COOLDOWN_MS=600000
RABBITMQ_MANAGEMENT_URL=http://localhost:15672
RABBITMQ_MANAGEMENT_USER=nexhire
RABBITMQ_MANAGEMENT_PASS=nexhire
TELEGRAM_BOT_TOKEN=123456:telegram-token
TELEGRAM_CHAT_ID=-1001234567890
```

Monitor only selected queues:

```env
QUEUE_MONITOR_QUEUES=cv-parsing.cv-uploaded,candidate.cv-parsed,job.application-submitted
```

Monitor all queues in the RabbitMQ vhost:

```env
QUEUE_MONITOR_QUEUES=
```

Manual Telegram alert test:

```bash
npm run test:script apps/notification-service/src/queue-monitor/manual/test-telegram-alert.ts
```

Optional test queue label:

```env
QUEUE_MONITOR_TEST_QUEUE=cv-parsing.cv-uploaded
```

Real RabbitMQ backlog simulation:

```bash
npm run test:script apps/notification-service/src/queue-monitor/manual/simulate-queue-backlog.ts
```

For this simulation, point the monitor to the generated test queue:

```env
QUEUE_MONITOR_TEST_QUEUE=queue-monitor.test-backlog
QUEUE_MONITOR_TEST_MESSAGE_COUNT=125
QUEUE_MONITOR_INTERVAL_MS=5000
QUEUE_MONITOR_TEST_AUTO_CLEANUP_DELAY_MS=15000
QUEUE_MONITOR_TEST_DELETE_QUEUE_DELAY_MS=15000
```

Start or restart `notification-service`, then run the script. When `QUEUE_MONITOR_QUEUES=` is empty, the monitor queries all real queues in the RabbitMQ vhost, so the generated test queue is watched automatically.

The monitor also sends risk alerts for:

- Any `.dlq` queue with `messages >= QUEUE_MONITOR_DLQ_ALERT_THRESHOLD`.
- Any non-DLQ queue with `messages >= QUEUE_MONITOR_NO_CONSUMER_ALERT_THRESHOLD` and `consumers=0`.

The script auto-cleans by default:

1. Create the test queue.
2. Publish backlog messages.
3. Wait `QUEUE_MONITOR_TEST_AUTO_CLEANUP_DELAY_MS`.
4. Purge messages so the monitor can send a recovered alert.
5. Wait `QUEUE_MONITOR_TEST_DELETE_QUEUE_DELAY_MS`.
6. Delete the test queue so RabbitMQ is clean again.

Manual cleanup only:

```bash
npm run test:script apps/notification-service/src/queue-monitor/manual/simulate-queue-backlog.ts -- --cleanup
```

After cleanup, the monitor sends a recovered alert on the next poll.

Disable auto cleanup when you want to inspect the backlog manually:

```bash
npm run test:script apps/notification-service/src/queue-monitor/manual/simulate-queue-backlog.ts -- --no-cleanup
```

Auto cleanup waits `QUEUE_MONITOR_TEST_AUTO_CLEANUP_DELAY_MS` before purging the queue, then waits `QUEUE_MONITOR_TEST_DELETE_QUEUE_DELAY_MS` before deleting the queue. Both default to `90000`, which is enough for the default 60-second monitor interval.
