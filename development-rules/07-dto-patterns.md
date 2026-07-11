# 07 - DTO Patterns

## 1. Always use DTOs

- Every request body, query, and route param group is bound to a DTO class.
- DTOs are classes so validation and transformation decorators work at runtime.

## 2. Request DTOs

- Decorate every field with the correct validator.
- Use `@IsOptional()` only for optional fields.
- Required fields use `@ApiProperty`; optional fields use `@ApiPropertyOptional`.
- Nullable response fields must set `nullable: true` in Swagger decorators.
- Do not include server-controlled fields in create DTOs.

## 3. Update DTOs

- Prefer `PartialType(CreateDto)` for patch-style DTOs.
- Avoid duplicating the full field list in update DTOs.

## 4. Query DTOs

- Use DTOs for pagination and filtering.
- Use `@Type(() => Number)` for numeric query params.
- Clamp pagination limits.
- When an endpoint exposes the standard `page` and `limit` pair, document it with `@ApiPaginationQueries()` from `@nexhire/shared`.

## 5. Response DTOs

- Define explicit response DTOs; never expose entities directly.
- Response DTOs describe the payload inside the success envelope, not the outer wrapper itself.

## 6. Mapping entity to DTO

- Map in the service layer with a mapper or small static helper.
- Keep mapping in one place per entity or aggregate.

## 7. Cross-service contract DTOs

- Shared request and response contracts between services belong in `@nexhire/shared/dto`.

## 8. Rules

- No business logic in DTOs.
- Every DTO field has `@ApiProperty` or `@ApiPropertyOptional`.
- API docs must match DTO required/optional/nullability exactly.
- Do not reuse request DTOs as response DTOs.
