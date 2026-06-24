# 14 — Code Quality

## 1. TypeScript strictness

- `strict: true` project-wide; do not disable strict flags per file.
- **No `any`.** Use a concrete type, generics, or `unknown` + narrowing. If unavoidable, add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a one-line reason.
- Type all public/exported method return values. `readonly` for injected deps and constants.
- `const` by default; `let` only when reassigned; never `var`.
- Prefer `?.` and `??` over manual null checks.

## 2. Lint & format (enforced)

- **ESLint + Prettier** are the source of truth. Code must pass `make lint` before commit/PR; CI rejects unformatted/lint-failing code.
- Baseline: 2-space indent, single quotes, trailing commas, semicolons, max line length 100, import sorting.
- No committed `// eslint-disable` without a reason comment.

## 3. Functions & complexity

- Small, single-purpose functions. If a method does several unrelated things, split it.
- Keep nesting shallow — use early returns / guard clauses instead of deep `if` pyramids.
- Avoid long parameter lists (> 3–4) — pass an options object or a DTO.
- No magic numbers/strings — name them as constants (event routing keys, limits, error codes live in `shared`).

## 4. Comments

- Comment the **why**, not the **what**. Don't restate code.
- Match surrounding comment density/style. Public service methods with non-obvious business rules get a short doc comment.
- Keep comments truthful and updated; a stale comment is a bug.

## 5. Dead code & TODOs

- No commented-out code blocks in commits — delete them (git keeps history).
- No unused imports, vars, or exports (ESLint enforces).
- `// TODO:` must reference an owner/issue: `// TODO(nexhire-42): paginate results`.

## 6. Logging

- Use the NestJS `Logger` (context = class name); never `console.log` in committed code.
- Never log secrets, passwords, full tokens, full CV content, or unmasked PII.

## 7. DRY vs duplication

- Reuse via `@nexhire/shared` for cross-service code; service-local helpers in `src/common/`.
- But don't over-abstract: a little duplication is better than the wrong abstraction. Extract when a pattern repeats ≥ 3 times with the same intent.

## 8. Consistency

- Match the style of surrounding code (naming, error handling, mapping approach). One project-wide approach per concern (e.g. one entity↔DTO mapping style) — don't mix.

## 9. Pre-commit checklist

- [ ] No `any`, no `console.log`, no commented-out code.
- [ ] `make lint` + `make test` + build pass.
- [ ] DTO validation present; errors use the standard shape.
- [ ] No secrets / `.env` / hardcoded URLs or ports.
- [ ] Swagger annotations on new endpoints; migration added if schema changed.
