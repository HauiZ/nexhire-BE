# 09 — Error Handling

## 1. Throw typed exceptions

- Use NestJS `HttpException` subclasses; never throw raw strings or return ad-hoc error objects.

| Situation | Exception | Status |
|-----------|-----------|--------|
| Invalid input shape | (auto from `ValidationPipe`) | 400 |
| Not authenticated | `UnauthorizedException` | 401 |
| Authenticated but not allowed | `ForbiddenException` | 403 |
| Resource missing | `NotFoundException` | 404 |
| Duplicate / state conflict | `ConflictException` | 409 |
| Valid shape, invalid semantics | `UnprocessableEntityException` | 422 |
| Rate limited | (throttler) | 429 |
| Unexpected | `InternalServerErrorException` | 500 |

```ts
const job = await this.jobRepo.findOne({ where: { id } });
if (!job) throw new NotFoundException(`Job ${id} not found`);
```

## 2. Global exception filter (in `@nexhire/shared`)

- A single `AllExceptionsFilter` registered via `APP_FILTER` formats every error into the standard shape. Controllers/services never format errors themselves.

```json
{
  "success": false,
  "error": {
    "code": "JOB_NOT_FOUND",
    "message": "Job 42 not found",
    "details": [ { "field": "email", "issue": "must be an email" } ]
  },
  "requestId": "5f3c..."
}
```

- `code`: stable machine-readable string (constant in `shared`). `message`: human-readable, safe. `details`: field errors from validation. `requestId`: the `x-request-id`.

## 3. Success envelope (response interceptor)

- A `ResponseInterceptor` (via `APP_INTERCEPTOR`) wraps successful returns:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 135 } }
```

- `meta` only for list/paginated responses. Controllers just return `data`.

## 4. Never leak internals

- No stack traces, SQL, file paths, or hostnames in client responses.
- Log the full error server-side (with `requestId`); return a safe message to the client.
- For 500s, return a generic message (`Internal server error`) + the `requestId` for support correlation.

## 5. Error codes

- Maintain error codes as constants in `@nexhire/shared/constants` (`ERROR_CODES.JOB_NOT_FOUND`). The frontend keys off `code`, not the message text.

## 6. Validation errors

- The global `ValidationPipe` produces field-level errors; the filter maps them into `error.details[]`. Keep messages user-friendly.

## 7. External failures (DB / HTTP / Gemini / MinIO)

- Wrap external calls; convert low-level errors into a meaningful `HttpException` (e.g. Gemini timeout → `ServiceUnavailableException` with code `AI_UNAVAILABLE`).
- Never let a raw driver/library error reach the client.

## 8. Logging discipline

- Log `error` for failures, `warn` for handled anomalies. Don't double-log the same error at every layer — log once where it's handled, with context.
- Never log secrets, tokens, passwords, or full CV content.

## 9. No silent failures

- No empty `catch {}`. Either handle meaningfully, rethrow, or convert to an `HttpException`. A swallowed error is a bug.
