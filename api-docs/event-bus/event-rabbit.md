# RabbitMQ Event Bus

RabbitMQ uses a durable topic exchange from `rabbitmq.exchange` with dotted routing keys from `packages/shared/src/constants/events.ts`.

## Events

| Routing key                          | Producer            | Consumer(s)                                     | Purpose                                                              |
| ------------------------------------ | ------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| `auth.email-verification-requested`  | auth-service        | notification-service email                      | Send verification email.                                             |
| `auth.password-reset-requested`      | auth-service        | notification-service email                      | Send password reset email.                                           |
| `application.submitted`              | application-service | job-service, notification-service               | Increment application count and notify.                              |
| `application.stage-changed`          | application-service | notification-service                            | Notify candidate about stage changes.                                |
| `cv.uploaded`                        | candidate-service   | cv-parsing-service                              | Start async profile CV parsing.                                      |
| `cv.parsed`                          | cv-parsing-service  | candidate-service                               | Apply parsed resume and mark CV parsed.                              |
| `cv.parse-failed`                    | cv-parsing-service  | candidate-service                               | Mark CV parse failed.                                                |
| `cv.match-requested`                 | reserved            | none currently                                  | Reserved for async matching flow.                                    |
| `document.uploaded`                  | reserved            | none currently                                  | Reserved for document lifecycle.                                     |
| `document.removed`                   | reserved            | none currently                                  | Reserved for document lifecycle.                                     |
| `candidate.profile-snapshot-changed` | candidate-service   | auth-service, application-service               | Sync candidate profile snapshot.                                     |
| `company.posting-snapshot-changed`   | company-service     | auth-service, job-service, notification-service | Sync company posting/read snapshots and notify verification changes. |
| `company-follow.job-published`       | candidate-service   | notification-service                            | Notify followers about newly published jobs.                         |
| `job.review-trust-signal`            | job-service         | company-service                                 | Feed company trust signals from job moderation.                      |
| `job.published`                      | job-service         | candidate-service                               | Build followed-company notification fanout.                          |
| `job.unpublished`                    | job-service         | application-service                             | Cancel/handle applications for unavailable job.                      |
| `job.closed`                         | job-service         | application-service                             | Cancel/handle applications for closed job.                           |
| `job.revision-approved`              | job-service         | none currently                                  | Reserved for downstream revision reactions.                          |

## Queues

| Queue                             | Service            | Bound routing keys                   |
| --------------------------------- | ------------------ | ------------------------------------ |
| `auth.company-link`               | auth-service       | `company.posting-snapshot-changed`   |
| `auth.candidate-profile`          | auth-service       | `candidate.profile-snapshot-changed` |
| `company.job-review-trust-signal` | company-service    | `job.review-trust-signal`            |
| `job.company-snapshot`            | job-service        | `company.posting-snapshot-changed`   |
| `job.application-submitted`       | job-service        | `application.submitted`              |
| `candidate.job-published-follow`  | candidate-service  | `job.published`                      |
| `candidate.cv-parsed`             | candidate-service  | `cv.parsed`, `cv.parse-failed`       |
| `cv-parsing.cv-uploaded`          | cv-parsing-service | `cv.uploaded`                        |

## Delivery Notes

Publishers use persistent messages on a confirm channel. Consumers use durable queues and manual `ack`/`nack`. Event handlers must be idempotent where the side effect can be repeated.

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

| Env                                | Default             | Purpose                                                               |
| ---------------------------------- | ------------------- | --------------------------------------------------------------------- |
| `QUEUE_MONITOR_ALERT_THRESHOLD`    | `100`               | Alert when `messages >= threshold`.                                   |
| `QUEUE_MONITOR_INTERVAL_MS`        | `60000`             | Poll interval.                                                        |
| `QUEUE_MONITOR_ALERT_COOLDOWN_MS`  | `900000`            | Per-queue cooldown to avoid alert spam.                               |
| `QUEUE_MONITOR_QUEUES`             | all known queues    | Comma-separated queue override. Empty means monitor all known queues. |
| `QUEUE_MONITOR_INCLUDE_TEST_QUEUE` | non-production only | Include `QUEUE_MONITOR_TEST_QUEUE` in watched queues for demos.       |
| `RABBITMQ_MANAGEMENT_VHOST`        | `/`                 | RabbitMQ vhost.                                                       |

Example:

```env
QUEUE_MONITOR_ENABLED=true
QUEUE_MONITOR_ALERT_THRESHOLD=100
QUEUE_MONITOR_INTERVAL_MS=60000
QUEUE_MONITOR_ALERT_COOLDOWN_MS=900000
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

Monitor all known queues:

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

Start or restart `notification-service`, then run the script. In local/dev, the monitor includes `QUEUE_MONITOR_TEST_QUEUE` automatically, reads the real RabbitMQ queue depth, and sends a Telegram backlog alert.

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
