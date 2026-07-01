# 09 - Error Handling

## 1. Throw typed exceptions

- Use NestJS `HttpException` subclasses.
- Never throw raw strings or return ad-hoc error objects.

## 2. Global exception filter

- `AllExceptionsFilter` from `@nexhire/shared` formats every error into the standard error envelope.
- Controllers and services do not build the outer error envelope themselves.
- Services may throw Nest `HttpException` subclasses with `{ code, message }` as the response body when a stable frontend error code is needed; the global filter wraps it.

## 3. Success envelope

- `ResponseInterceptor` wraps successful responses into:

```json
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 20, "total": 135 } }
```

- `meta` exists only for paginated responses.
- Swagger should reflect these envelopes through shared decorators:
  - `@ApiSuccessResponse(...)`
  - `@ApiErrorResponses(...)`
  - `@ApiCommonErrorResponses()`

## 4. Never leak internals

- Do not expose stack traces, SQL, file paths, or hostnames to clients.
- Log the full error server-side and return safe messages.

## 5. Error codes

- Keep stable error codes in `@nexhire/shared/constants`.
- Frontend logic keys off `code`, not free-form messages.
- Add new error codes in `@nexhire/shared/constants/error-codes.ts`; do not invent one-off strings in feature code.

## 6. Validation errors

- Validation errors are mapped into `error.details[]` by the global filter.
- Keep messages user-friendly.

## 7. External failures

- Convert low-level external failures into meaningful `HttpException`s.
- Never leak raw driver or SDK errors to the client.

## 8. Logging discipline

- Log once where the error is handled, with enough context.
- Never log secrets, passwords, tokens, or sensitive document contents.

## 9. No silent failures

- No empty `catch {}` blocks.
- Handle, rethrow, or convert explicitly.
