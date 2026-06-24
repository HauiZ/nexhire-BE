# 02 — Naming Conventions

## 1. Files (kebab-case)

| Type | Suffix | Example |
|------|--------|---------|
| Module | `.module.ts` | `job.module.ts` |
| Controller | `.controller.ts` | `application.controller.ts` |
| Service | `.service.ts` | `cv.service.ts` |
| Entity | `.entity.ts` | `job-post.entity.ts` |
| DTO | `.dto.ts` | `create-job.dto.ts` |
| Enum | `.enum.ts` | `application-stage.enum.ts` |
| Interface | `.interface.ts` | `cv-parse-result.interface.ts` |
| Guard | `.guard.ts` | `jwt-auth.guard.ts` |
| Strategy | `.strategy.ts` | `jwt.strategy.ts` |
| Decorator | `.decorator.ts` | `current-user.decorator.ts` |
| Filter | `.filter.ts` | `all-exceptions.filter.ts` |
| Interceptor | `.interceptor.ts` | `response.interceptor.ts` |
| Config | `.config.ts` | `auth.config.ts` |
| Migration | `<timestamp>-<Name>.ts` | `1718900000000-CreateUser.ts` |
| Spec | `.spec.ts` / `.e2e-spec.ts` | `cv.service.spec.ts` |

- No spaces, no uppercase, no accented/Vietnamese characters in file names.

## 2. Code identifiers

| Element | Case | Example |
|---------|------|---------|
| Class / Interface / Enum / Type | `PascalCase` | `CreateJobDto`, `ApplicationStage` |
| Variable / function / method / property | `camelCase` | `findByEmail`, `accessToken` |
| Constant / env key | `UPPER_SNAKE_CASE` | `JWT_ACCESS_TTL`, `QUEUE_PARSE_CV` |
| Enum member | `UPPER_SNAKE_CASE` | `JobStatus.OPEN` |
| Generic type param | single cap / `TName` | `T`, `TPayload` |

- English only, meaningful. Avoid abbreviations (`usr`, `cmp`, `repo` is OK as it's idiomatic).
- Booleans: prefix `is/has/can/should` → `isActive`, `hasResume`, `canApply`.
- Async functions returning a promise read as actions: `parseCv`, `sendEmail`, `findOpenJobs`.

## 3. Class name ↔ responsibility

- Controllers end with `Controller`: `JobController`.
- Services end with `Service`: `JobService`.
- DTOs end with `Dto`: `CreateJobDto`, `JobResponseDto`.
- Entities are the bare domain noun: `Job`, `Application`, `User` (file `job.entity.ts`).
- Guards/filters/interceptors carry their role: `JwtAuthGuard`, `AllExceptionsFilter`.

## 4. Database names (snake_case)

- Tables: singular noun — `user`, `job_post`, `application`, `cv`.
- Columns: `snake_case` — `created_at`, `full_name`, `company_id`.
- FK columns: `<entity>_id` — `user_id`, `job_id`.
- Boolean columns: `is_*` / `has_*`.
- Index name: `idx_<table>_<columns>`; unique: `uq_<table>_<columns>`.

## 5. API routes (kebab-case, plural)

- `/api/v1/jobs`, `/api/v1/job-posts`, `/api/v1/applications`, `/api/v1/cvs`.
- Nested ownership: `/jobs/:jobId/applications`.

## 6. Events, headers (constants in `shared`)

- Event routing keys: `application.submitted`, `cv.uploaded`, `application.stage-changed` — format `<aggregate>.<event>`, dot-namespaced, lower-case (in `EVENTS`).
- Custom headers: `x-request-id`, `x-user-id`, `x-user-role`.
- Define every such string once as a constant in `@nexhire/shared` — never inline string literals.
