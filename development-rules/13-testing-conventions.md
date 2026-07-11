# 13 - Testing Conventions

## 1. Tooling

- Jest + ts-jest for unit tests.
- `@nestjs/testing` for module/integration tests.
- Supertest for e2e tests.
- CI should block merge on a red suite.

### Commands

```bash
npm test
npm run test:watch
npm run test:cov
npm run test:debug
npm run test:e2e
npx jest apps/auth-service/src/auth/test/auth.service.spec.ts --runInBand
```

- Unit config matches `*.spec.ts`.
- E2E config matches `*.e2e-spec.ts`.
- Tests map workspace aliases so they do not require a build step first.

## 2. Layout and naming

- Unit tests live under a per-module `test/` folder, for example `src/auth/test/auth.service.spec.ts`.
- E2E tests live under `apps/<service>/test/*.e2e-spec.ts`.
- Manual flow scripts live under `test/test-flows/`.
- Manual flow scripts run with `npm run test:script <script-path> [...args]`.
- Prefer TypeScript scripts that call HTTP APIs directly.
- Each manual script should represent one complete business flow; avoid tiny endpoint-per-file scripts.
- Prefer names like `test/test-flows/test-auth-api.ts` or `test/test-flows/test-document-storage-api.ts`.
- Test names describe behavior, not implementation: `it('rejects a duplicate application to the same job')`.

## 3. Required coverage by risk

- Service business logic: auth flows, application stage transitions, job search filters, ownership/tenancy checks, scoring/matching logic.
- Error paths and edge cases, not only happy paths.
- DTO validation for meaningful request contracts.
- Authorization and ownership denial paths for protected resources.
- AI logic with fixed mocked Gemini responses. Never call the real API in tests.
- Event publishing/consuming behavior with mocked event bus or consumer dependencies.

## 4. Mocking

- No real network, DB, Gemini, SMTP, RabbitMQ, Redis, or MinIO in unit tests.
- Mock repositories and infra wrappers.

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

- Integration tests needing a DB use a disposable test schema, container, or transaction rollback.
- Never run tests against dev or production data.

## 5. Quality bar

- Arrange, Act, Assert.
- One behavior focus per test.
- Tests must be deterministic: no real clock/random dependence unless controlled.
- Prefer meaningful assertions over coverage padding.

## 6. Coverage

- Minimum target: 70% line coverage on `*.service.ts` once a service is product-active.
- Controllers and DTOs are usually covered through e2e and service tests.
- Coverage is a floor, not the goal.

## 7. Definition of done

- Every completed business logic change has focused unit tests in the same module.
- User-facing API flows that need manual local verification include or update a script under `test/test-flows/`.
- Schema changes have migrations.
- Swagger annotations are present.
- Build passes.
- Relevant unit tests pass.
