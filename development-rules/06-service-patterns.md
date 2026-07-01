# 06 - Service Patterns

## 1. Services own business logic

All domain rules, validation beyond DTO shape, orchestration, DB access, and external calls live in providers (`*.service.ts`).

Controllers route. Services decide.

## 2. Dependency injection

- Inject dependencies through the constructor with `private readonly`.
- Inject repositories with `@InjectRepository(Entity)`.
- Use `DataSource` only for transactions and advanced cases, not normal single-repository queries.
- Cross-service access goes through an injected HTTP client wrapper, event publisher, or queue producer.
- Never instantiate services/repositories manually with `new`.

## 3. Return shape

- Services return response DTOs or plain objects that match response DTOs.
- Do not return raw entities to controllers.
- Never leak password hashes, token hashes, internal flags, or fields from unrelated aggregates.
- Map entity-to-response in one place per aggregate, either through a mapper or a small private/static helper.

## 4. Errors

- Throw typed Nest `HttpException` subclasses: `NotFoundException`, `ConflictException`, `ForbiddenException`, `BadRequestException`, etc.
- Include `{ code, message }` when frontend needs a stable machine-readable error code.
- Do not return `null` or `undefined` from public service methods to signal "not found"; throw unless the caller explicitly handles optional lookup.
- Validate ownership and authorization in services too, not only in guards.

## 5. Transactions

- Multi-write operations that must be atomic run in a transaction.
- Keep transactions short.
- Do not perform slow external calls, email, RabbitMQ publish, Gemini calls, or object storage operations inside a DB transaction.

```ts
await this.dataSource.transaction(async (manager) => {
  await manager.save(application);
  await manager.save(statusHistory);
});
```

## 6. Async side effects

- AI parsing, matching, notification, and document lifecycle side effects should be event-driven when they can outlive the request.
- Request handlers should return quickly after persisting state and publishing events.
- Workers/consumers own retry and failure logging behavior.

## 7. Focus and size

- One service class should have one bounded responsibility.
- Split private helpers when a method mixes unrelated concerns.
- Avoid long parameter lists; pass a DTO/options object when inputs grow.
- Use `Logger`, never `console.log`.

## 8. Idempotency

- Guard against duplicate side effects.
- Examples: do not double-submit an application, double-enqueue a job, reuse a consumed password reset token, or resend during cooldown.
