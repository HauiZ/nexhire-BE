# 06 — Service Patterns

## 1. Services hold the business logic

All domain rules, validation beyond shape, orchestration, DB access, and external calls live in providers (`*.service.ts`).

```ts
@Injectable()
export class ApplicationService {
  private readonly logger = new Logger(ApplicationService.name);

  constructor(
    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,
    private readonly jobClient: JobClient, // HTTP client to job service
  ) {}

  async create(userId: string, dto: CreateApplicationDto): Promise<ApplicationResponseDto> {
    const job = await this.jobClient.getJob(dto.jobId); // cross-service via HTTP
    if (job.status !== JobStatus.OPEN) {
      throw new ConflictException('Job is not open for applications');
    }

    const existing = await this.applicationRepo.findOne({
      where: { jobId: dto.jobId, candidateId: userId },
    });
    if (existing) {
      throw new ConflictException('You have already applied to this job');
    }

    const application = this.applicationRepo.create({
      jobId: dto.jobId,
      candidateId: userId,
      cvId: dto.cvId,
      stage: ApplicationStage.SUBMITTED,
    });
    const saved = await this.applicationRepo.save(application);
    return ApplicationMapper.toResponse(saved);
  }
}
```

## 2. Dependency injection

- Inject everything via the constructor with `private readonly`. Never `new` a service/repository manually.
- Inject repositories with `@InjectRepository(Entity)`. Don't reach into the global DataSource for normal queries.
- Cross-service access goes through an injected HTTP client wrapper or a queue producer — never a direct import of the other service.

## 3. Return shape

- Services return **response DTOs / plain objects**, not raw entities, to controllers. Map with a dedicated mapper (`07-dto-patterns.md`).
- Never leak password hashes, internal flags, or other entities' fields in the returned shape.

## 4. Errors

- Throw typed `HttpException` subclasses with a clear message: `NotFoundException`, `ConflictException`, `ForbiddenException`, `BadRequestException`.
- Don't return `null`/`undefined` to signal "not found" from a public method — throw `NotFoundException` (unless the caller explicitly handles optional).
- Validate ownership/authorization here too (defense in depth), not only in guards.

## 5. Transactions

- Multi-write operations that must be atomic run in a transaction:

```ts
await this.dataSource.transaction(async (manager) => {
  await manager.save(application);
  await manager.save(statusHistory);
});
```

- Keep transactions short; don't make slow external calls (HTTP/Gemini) inside a DB transaction.

## 6. Long-running / external work goes async

- AI parsing/matching and email are enqueued (BullMQ), not awaited inline in a request path (`12-infrastructure-patterns.md`).
- A request that triggers AI returns quickly (e.g. status `PROCESSING`); the worker updates state and notifies.

## 7. Keep services focused

- One service = one bounded responsibility. If a service grows multiple unrelated concerns, split it.
- Extract reusable pure logic (scoring, formatting) into well-named private methods or helpers; keep methods small.
- No `console.log` — use the injected `Logger` with the class name as context.

## 8. Idempotency & side effects

- Guard against duplicate side effects (e.g. don't double-submit an application, don't re-enqueue an already-queued job). Check state before acting.
