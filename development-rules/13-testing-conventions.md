# 13 — Testing Conventions

## 1. Tooling

- **Jest** + **ts-jest** for unit tests; `@nestjs/testing` for module/integration tests; **Supertest** for e2e.
- CI runs them on every PR; a red suite blocks merge.

### Commands

```bash
npm test            # run all unit tests (*.spec.ts), config: jest.config.js
npm run test:watch  # watch mode
npm run test:cov    # unit tests + coverage report (./coverage)
npm run test:debug  # run under the Node inspector
npm run test:e2e    # run e2e tests (*.e2e-spec.ts), config: test/jest-e2e.json
```

- Unit config (`jest.config.js`) matches `*.spec.ts`; e2e config (`test/jest-e2e.json`) matches `*.e2e-spec.ts`. Both map `@nexhire/shared` to its source so tests need no build step.

## 2. Layout & naming

- Unit test co-located: `cv.service.spec.ts` next to `cv.service.ts`.
- e2e under `apps/<service>/test/*.e2e-spec.ts`.
- Test names describe behavior: `it('rejects a duplicate application to the same job')`.

## 3. What must be tested

- **Service business logic** (the core): auth flows, application stage transitions, job search filters, ownership/tenancy checks, scoring/matching logic.
- **Validation**: DTO rules reject bad input.
- **Authorization**: role + ownership guards deny unauthorized access (candidate can't touch another user's CV; recruiter can't touch another company's job).
- **AI logic**: against fixed mocked Gemini responses — never call the real API.
- **Error paths & edge cases**, not just the happy path.

## 4. Mocking

- No real network, DB, Gemini, SMTP, or MinIO in unit tests. Mock repositories and infra wrappers.

```ts
const repo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
const moduleRef = await Test.createTestingModule({
  providers: [
    ApplicationService,
    { provide: getRepositoryToken(Application), useValue: repo },
    { provide: JobClient, useValue: { getJob: jest.fn() } },
  ],
}).compile();
```

- Integration tests needing a DB use a disposable test schema or a per-test transaction rolled back. Never run tests against dev/prod data.

## 5. Structure & quality

- Arrange–Act–Assert. One behavior focus per test.
- Tests are independent and deterministic — no shared mutable state, no order dependence, no real clock/random reliance.
- Prefer meaningful assertions over coverage padding. A test that asserts nothing real is worse than none.

## 6. Coverage

- Minimum **70%** line coverage on `*.service.ts`. Controllers/DTOs are covered via e2e + indirectly.
- Coverage is a floor, not the goal.

## 7. Definition of done

- A feature PR includes: code + tests + Swagger annotations + migration (if schema changed).
- `make lint`, `make test`, and build all pass locally before opening the PR.
