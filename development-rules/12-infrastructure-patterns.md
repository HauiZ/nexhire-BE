# 12 — Infrastructure Patterns

> All reusable backing-system adapters live in **`@nexhire/infra`** and are configured once, injected where needed. Shared infra config (`registerAs('db'|'redis'|'storage')`) is in `packages/infra/src/config/infra.config.ts`. Single-consumer clients (Gemini, per-target HTTP clients) stay in the owning service. Queue **names** remain contracts in `@nexhire/shared`.

| Concern | Provided by `@nexhire/infra` | Used by |
|---------|------------------------------|---------|
| Postgres/TypeORM options + `BaseEntity` | `buildTypeOrmOptions`, `buildDataSourceOptions`, `BaseEntity` | all DB services |
| Redis client | `RedisModule.forRoot()` + `REDIS_CLIENT` | auth (token store), … |
| BullMQ wiring | `QueueModule.forRoot()` | cv-app, ai, notification |
| MinIO | `StorageModule` + `StorageService` | cv-app |

## 1. PostgreSQL / TypeORM

- Connection configured via `TypeOrmModule.forRootAsync` using `buildTypeOrmOptions('<schema>')` from `@nexhire/infra`; `schema` set per service; `synchronize: false` always.
- Access tables only through injected repositories (`@InjectRepository`). Use the query builder for complex queries — never string-concatenate SQL.
- Paginate at the DB (`take`/`skip`); index filtered/sorted columns (`08-entity-patterns.md`).
- Wrap multi-write atomic operations in a transaction; keep external calls out of transactions.

## 2. Redis + queues (BullMQ)

- Redis is the queue/cache layer. Long-running or fire-and-forget work goes through a queue — it does not block the request.
- Wire it via `@nexhire/infra`: `RedisModule.forRoot()` for a raw `REDIS_CLIENT`, `QueueModule.forRoot()` for BullMQ. Both read `redisConfig` (loaded in the service's ConfigModule).
- Queue **names** are constants in `@nexhire/shared`: `ai.parse-cv`, `ai.match`, `notification.send`. Register a queue with `BullModule.registerQueue({ name: QUEUES.AI_PARSE_CV })`.

```ts
// producer (e.g. cv-app)
await this.parseCvQueue.add('parse', { cvId, objectKey }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
});

// consumer (ai service) — a @Processor worker updates state + emits notification
```

- Every job: bounded `attempts` with backoff, `removeOnComplete`, idempotent handler (safe to retry).
- Producer returns immediately (e.g. status `PROCESSING`); the worker persists the result and triggers notification.

## 3. MinIO (object storage)

- All file blobs (CV PDF/DOCX, exported CV PDFs) live in MinIO — never in the DB or local disk. The DB stores only the object key.
- Use `StorageModule` + `StorageService` from `@nexhire/infra` (reads `storageConfig`). Features call `storageService.put/presignedGetUrl/remove`, never the SDK directly.
- Object keys are randomized (e.g. `cv/{uuid}.pdf`); never use the client filename as the path.
- Downloads use short-lived **pre-signed URLs**; buckets are not public.
- Validate uploads (allowlisted MIME, magic bytes, max size) before storing (`11`/security rules).

## 4. HTTP inter-service client

- Wrap `HttpService` in a typed client per target service (`JobClient`, `AuthClient`), reading base URL from config.

```ts
@Injectable()
export class JobClient {
  constructor(private readonly http: HttpService, private readonly config: ConfigService) {}

  async getJob(id: string): Promise<JobContractDto> {
    const url = `${this.config.get<string>('cvapp.jobServiceUrl')}/api/v1/jobs/${id}`;
    const { data } = await firstValueFrom(
      this.http.get(url, { timeout: 5000, headers: { 'x-request-id': /* propagate */ } }),
    );
    return data.data;
  }
}
```

- Every call: timeout (5s normal, 30s AI), bounded retry on transient errors, propagate `x-request-id`.
- Map remote errors into local `HttpException`s; never leak the remote's raw error.

## 5. Gemini (AI) client

- Single consumer (`ai` service), so it stays app-local in `apps/ai/src/gemini/` — **not** in `@nexhire/infra`. (Promote to infra only if another service ever needs it.)
- Wrap the Gemini SDK/REST in a `GeminiClient` reading `GEMINI_API_KEY` + `GEMINI_MODEL` from config. Model name is configurable, not hardcoded.
- Treat CV text as **untrusted input** (prompt-injection): use structured prompts/templates in `src/prompts/`, constrain output (JSON schema), and validate the parsed result.
- Set `maxOutputTokens` + low `temperature` for deterministic extraction. Apply timeout + retry + per-user quota.
- Persist results (model + version, output, score, timestamp) in `ai_schema` for auditability.

## 6. Email (notification)

- `MailerModule` (nodemailer + Handlebars) configured from SMTP env. Templates live in `src/templates/*.hbs`.
- Notification is triggered via the `notification.send` queue, not synchronous calls from other services.

## 7. Health & observability

- Each service exposes `GET /health` (`@nestjs/terminus`) checking its own DB/Redis dependencies; Docker/orchestration use it for readiness.
- Structured logs to stdout including `x-request-id`. Log key lifecycle events (boot port/schema/env, queue job start/finish).

## 8. Rules

- Never talk to infrastructure (DB/Redis/MinIO/Gemini/SMTP) with raw SDK calls scattered in features — go through the injected wrapper/service.
- Reusable adapters (DB/Redis/queue/storage) live in `@nexhire/infra`; single-consumer ones stay in the owning service. A service opts in by importing the infra module (e.g. `StorageModule`) and loading the matching config (`storageConfig`).
- All endpoints, hosts, and credentials for infra come from config (`10-config-patterns.md`).
