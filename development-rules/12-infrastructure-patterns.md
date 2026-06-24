# 12 — Infrastructure Patterns

> All reusable backing-system adapters live in **`@nexhire/infra`** and are configured once, injected where needed. Shared infra config (`registerAs('db'|'redis'|'rabbitmq'|'storage')`) is in `packages/infra/src/config/infra.config.ts`. Single-consumer clients (Gemini, per-target HTTP clients) stay in the owning service. Event **routing keys** remain contracts in `@nexhire/shared`.

| Concern | Provided by `@nexhire/infra` | Used by |
|---------|------------------------------|---------|
| Postgres/TypeORM options + `BaseEntity` | `buildTypeOrmOptions()`, `buildDataSourceOptions()`, `BaseEntity` | all DB services |
| Redis client (cache / rate limit / token store) | `RedisModule.forRoot()` + `REDIS_CLIENT` | auth (token store), … |
| RabbitMQ event bus | `EventBusModule` + `EventPublisher` | producers + consumers |
| MinIO | `StorageModule` + `StorageService` | cv-app |

## 1. PostgreSQL / TypeORM (database-per-service)

- Each service connects to its **own database** with its **own user** — `databaseConfigFor('<PREFIX>')` + `TypeOrmModule.forRootAsync({ useFactory: buildTypeOrmOptions() })` from `@nexhire/infra`. `synchronize: false` always.
- No shared database, no cross-database access (blocked by per-user grants + plain SQL can't cross databases). Cross-service data → API call or event.
- Access tables only through injected repositories (`@InjectRepository`). Use the query builder for complex queries — never string-concatenate SQL.
- Paginate at the DB (`take`/`skip`); index filtered/sorted columns (`08-entity-patterns.md`).
- Wrap multi-write atomic operations in a transaction; keep external calls out of transactions.

## 2. RabbitMQ (async event bus)

- RabbitMQ is the **primary async channel** for inter-service communication. Long-running or fire-and-forget work (AI parsing/matching, email) is published as a **domain event** — it does not block the request.
- A topic exchange (`nexhire.events`) routes by key. **Routing keys** are constants in `@nexhire/shared`: `EVENTS.APPLICATION_SUBMITTED`, `EVENTS.CV_UPLOADED`, etc.
- Publish via `EventPublisher` from `@nexhire/infra` (import `EventBusModule`, load `rabbitmqConfig`):

```ts
// producer (e.g. cv-app) — fire the event, don't wait for downstream work
await this.events.publish(EVENTS.CV_UPLOADED, { cvId, objectKey });
// returns immediately; the request responds with status PROCESSING
```

```ts
// consumer (e.g. ai) — bind a durable queue to the routing key, ack after handling
// channel.assertQueue('ai.cv-uploaded', { durable: true })
// channel.bindQueue('ai.cv-uploaded', 'nexhire.events', EVENTS.CV_UPLOADED)
// on message: process -> persist -> publish a follow-up event -> channel.ack(msg)
```

- **Reliability rules:** durable exchange/queues + persistent messages; **idempotent consumers** (safe to redeliver); **manual ack** after successful handling; configure a **dead-letter queue** for poison messages; bounded retry/backoff.
- Redis is **not** the message broker anymore — it is cache / rate limit / token store only.

## 3. Eventual consistency (saga / outbox)

DB-per-service means **no cross-service ACID transaction**. Multi-service workflows use eventual consistency:

- **Saga:** model a workflow as a sequence of local transaction + event (e.g. `application submitted` → job updates its applicant count on the event → notification sends on the event). On failure, emit a compensating event.
- **Transactional outbox:** to publish an event *reliably* with a DB write, write the event row in the **same local transaction** as the state change, then a relay publishes it to RabbitMQ (at-least-once). Prevents "saved but event lost".
- Consumers must be **idempotent** (dedupe by event id) because delivery is at-least-once.

## 4. Redis (cache / rate limit / token store)

- `RedisModule.forRoot()` exposes a configured `REDIS_CLIENT` (ioredis). Reads `redisConfig`.
- Uses: response/data caching, rate-limit counters, JWT refresh-token store + revocation list. **Not** for messaging.

## 5. MinIO (object storage)

- All file blobs (CV PDF/DOCX, exported CV PDFs) live in MinIO — never in the DB or local disk. The DB stores only the object key.
- Use `StorageModule` + `StorageService` from `@nexhire/infra` (reads `storageConfig`). Features call `storageService.put/presignedGetUrl/remove`, never the SDK directly.
- Object keys are randomized (e.g. `cv/{uuid}.pdf`); never use the client filename as the path.
- Downloads use short-lived **pre-signed URLs**; buckets are not public.
- Validate uploads (allowlisted MIME, magic bytes, max size) before storing (`06-security` rules).

## 6. HTTP inter-service client (sync, when an immediate answer is needed)

- Wrap `HttpService` in a typed client per target service (`JobClient`, `AuthClient`), reading base URL from config.

```ts
@Injectable()
export class JobClient {
  constructor(private readonly http: HttpService, private readonly config: ConfigService) {}

  async getJob(id: string): Promise<JobContractDto> {
    const url = `${this.config.get<string>('cvapp.services.job')}/api/v1/jobs/${id}`;
    const { data } = await firstValueFrom(
      this.http.get(url, { timeout: 5000, headers: { 'x-request-id': /* propagate */ } }),
    );
    return data.data;
  }
}
```

- Every call: timeout (5s normal, 30s AI), bounded retry on transient errors, propagate `x-request-id`.
- **Circuit breaker** (e.g. `opossum`) on calls to a dependency that can be slow/down; degrade gracefully (cached/empty result) instead of cascading failure.
- Map remote errors into local `HttpException`s; never leak the remote's raw error.
- Prefer events over sync calls when an immediate response isn't required (lower coupling).

## 7. Gemini (AI) client

- Single consumer (`ai` service), so it stays app-local in `apps/ai/src/gemini/` — **not** in `@nexhire/infra`. (Promote to infra only if another service ever needs it.)
- Wrap the Gemini SDK/REST in a `GeminiClient` reading `GEMINI_API_KEY` + `GEMINI_MODEL` from config. Model name is configurable, not hardcoded.
- Treat CV text as **untrusted input** (prompt-injection): use structured prompts/templates in `src/prompts/`, constrain output (JSON schema), and validate the parsed result.
- Set `maxOutputTokens` + low `temperature` for deterministic extraction. Apply timeout + retry + per-user quota.
- Persist results (model + version, output, score, timestamp) in `ai_db` for auditability.

## 8. Email (notification)

- `MailerModule` (nodemailer + Handlebars) configured from SMTP env. Templates live in `src/templates/*.hbs`.
- Notification is triggered by **consuming events** (e.g. `application.submitted`, `application.stage-changed`), not by synchronous calls from other services.

## 9. Observability & health

- Each service exposes `GET /health` (`@nestjs/terminus`) checking its own DB/dependencies; Docker/orchestration use it for readiness.
- **Structured logging** (Pino) to stdout; every log carries the `x-request-id` correlation id.
- **Distributed tracing** (OpenTelemetry → Jaeger): propagate trace context across gateway → service → RabbitMQ so a request can be followed end-to-end. This is essential once calls span services.
- Log key lifecycle events (boot port/db/env, event published/consumed, job outcome).

## 10. Rules

- Never talk to infrastructure (DB/Redis/RabbitMQ/MinIO/Gemini/SMTP) with raw SDK calls scattered in features — go through the injected wrapper/service.
- Reusable adapters (DB/Redis/messaging/storage) live in `@nexhire/infra`; single-consumer ones stay in the owning service. A service opts in by importing the infra module (e.g. `EventBusModule`, `StorageModule`) and loading the matching config.
- Async-first: prefer events; use sync HTTP only when the caller needs the answer now.
- All endpoints, hosts, and credentials for infra come from config (`10-config-patterns.md`).
