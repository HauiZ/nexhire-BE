# Event Bus Governance & Reliability Plan

## Goal

Improve RabbitMQ event bus governance without changing the product behavior of the main flows.

This plan focuses on:

- A consistent event envelope for tracking and debugging.
- A reusable queue topology helper for durable queues, retry queues, and dead letter queues.
- Retry/DLQ protection for the important queues that already drive core flows.
- Better alert coverage for queues, including DLQ backlog and missing consumers.

Transactional outbox is intentionally left as a later phase because it requires database schema and write-path changes per service.

## Current Baseline

Already in place:

- RabbitMQ topic exchange.
- Durable queues in current consumers.
- Persistent published messages.
- Manual ack in consumers.
- Confirm channel through `EventPublisher`.
- Telegram queue backlog monitor in `notification-service`.

Known gaps:

- Event payloads do not share a standard metadata envelope.
- Consumer retry/DLQ behavior is not standardized.
- Queue declaration is duplicated per consumer.
- Failed messages are usually `nack(requeue=false)` without a queue-specific DLQ topology.
- Queue monitor does not explicitly distinguish normal queue backlog from DLQ backlog or no-consumer risk.

## Phase 1 - Event Envelope

### Change

Add shared event contract helpers in `packages/shared`:

- `EventEnvelope<T>`
- `createEventEnvelope(...)`
- `unwrapEventData(...)`
- `isEventEnvelope(...)`

Envelope format:

```ts
{
  eventId: string;
  eventType: string;
  occurredAt: string;
  producer: string;
  correlationId?: string;
  causationId?: string;
  data: T;
}
```

### Effect

- Every important event can be traced with `eventId`.
- Consumers can support both new envelope payloads and old raw payloads during migration.
- Telegram/logging can show event metadata later.

### Scope

Apply envelope first to the CV parsing flow:

- `cv.uploaded`
- `cv.parsed`
- `cv.parse-failed`

## Phase 2 - Queue Topology Helper

### Change

Add reusable RabbitMQ helper in `packages/infra`:

- Main queue declaration.
- Retry queue declaration.
- DLQ declaration.
- Main exchange binding.
- DLX/retry exchange binding.

Proposed topology per queue:

- Main queue: `<queue>`
- Retry queue: `<queue>.retry`
- DLQ: `<queue>.dlq`
- DLX exchange: `<rabbitmq.exchange>.dlx`
- Retry exchange: `<rabbitmq.exchange>.retry`

### Effect

- Consumers stop hand-rolling queue setup.
- Important queues get consistent DLQ and retry behavior.
- RabbitMQ UI becomes easier to inspect.

### Scope

Apply first to:

- `cv-parsing.cv-uploaded`
- `candidate.cv-parsed`
- `job.application-submitted`

## Phase 3 - Retry Then DLQ

### Change

Add reusable retry helper in `packages/infra`:

- Reads `x-retry-count` header.
- Retries transient failures up to 3 times.
- Publishes failed message to retry exchange with incremented retry header.
- Sends message to DLQ after max retries.

### Effect

- Avoids endless loops.
- Avoids losing failed events.
- Keeps the main queue moving when one event is poisoned.

### Scope

Apply first to:

- CV uploaded consumer in `cv-parsing-service`.
- CV parsed/failed consumer in `candidate-service`.
- Application submitted consumer in `job-service`.

## Phase 4 - Queue Monitor Improvements

### Change

Improve Telegram monitor classification:

- Normal queue backlog.
- DLQ backlog.
- No consumer while messages are waiting.

### Effect

- Team sees immediately whether the problem is normal lag, failed events, or no running consumer.
- Demo alerts become clearer.

## Phase 5 - Documentation Update

### Change

Update `api-docs/event-bus/event-rabbit.md` with:

- Envelope contract.
- Queue naming.
- Retry/DLQ topology.
- Operational behavior.

### Effect

- Team has one place to understand how to add new bus flows safely.

## Out Of Scope For This Pass

Transactional outbox is not implemented in this pass.

Reason:

- It needs database migrations per service.
- It changes write-path semantics.
- It should start with one flow, likely candidate CV upload or application submitted, after the bus contract and DLQ rules are stable.

## Verification

Run:

```bash
npm run build
npm test -- --runInBand
```

Optional manual checks:

```bash
npm run test:script apps/notification-service/src/queue-monitor/manual/simulate-queue-backlog.ts
```

Expected result:

- Existing tests pass.
- Important queue consumers still process current payloads.
- RabbitMQ contains `.retry` and `.dlq` queues for upgraded consumers.
- Telegram monitor reports DLQ/no-consumer conditions more clearly.
