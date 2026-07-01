# 14 - Code Quality

## 1. TypeScript strictness

- Keep `strict: true` project-wide.
- Do not disable strict flags per file.
- Avoid `any`. Use concrete types, generics, or `unknown` plus narrowing.
- If `any` is unavoidable, add an ESLint disable with a short reason.
- Type all public/exported method return values.
- Use `readonly` for injected dependencies and constants.
- Use `const` by default; `let` only when reassigned; never `var`.
- Prefer `?.` and `??` over verbose null checks.

## 2. Lint and format

- ESLint and Prettier are the source of truth.
- Do not commit unused imports, unused variables, or formatter churn.
- Baseline style: 2-space indent, single quotes, trailing commas, semicolons.
- Do not add committed `eslint-disable` comments without a reason.

## 3. Functions and complexity

- Keep functions small and single-purpose.
- Use guard clauses to keep nesting shallow.
- Avoid long parameter lists; use DTOs/options objects.
- Avoid magic numbers and strings. Name constants, especially events, headers, limits, and error codes.
- Do not fix unrelated bugs while implementing a scoped task; mention them separately.

## 4. Comments

- Comment the why, not the obvious what.
- Keep comments truthful and updated.
- Public service methods with non-obvious business rules may have a short doc comment.
- Avoid comment noise in straightforward code.

## 5. Dead code and TODOs

- Delete commented-out code.
- No unused exports.
- `TODO` comments must include an owner or issue reference, for example `TODO(nexhire-42): paginate results`.

## 6. Logging

- Use NestJS `Logger` with class context.
- Never log secrets, passwords, token hashes, full tokens, full CV content, or unmasked sensitive PII.
- Log errors once at the boundary that handles them.

## 7. Reuse vs abstraction

- Cross-service reusable code belongs in `@nexhire/shared` or `@nexhire/infra`.
- Service-local helpers belong under the owning service.
- Do not over-abstract early. Extract only when repetition has the same intent and the abstraction improves clarity.

## 8. Consistency

- Match surrounding style.
- Use one project-wide approach per concern: response envelopes, error codes, config namespaces, migrations, event constants, and auth headers.
- New patterns must update `development-rules/` and README when they affect team workflow.

## 9. Pre-commit checklist

- [ ] No `any`, `console.log`, commented-out code, or leaked secrets.
- [ ] DTO validation and Swagger annotations are present.
- [ ] Errors use standard codes and envelope behavior.
- [ ] Env/config changes update `.env.example` and validation schema.
- [ ] DB changes include a reviewed migration.
- [ ] Relevant tests pass.
- [ ] Build passes.
