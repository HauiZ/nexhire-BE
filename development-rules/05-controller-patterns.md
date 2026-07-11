# 05 - Controller Patterns

## 1. Controllers are thin

A controller only routes the request, binds and validates DTO input, calls a service, and returns the result. No business logic, no DB access, no external calls.

```ts
@ApiTags('applications')
@Controller('applications')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Post()
  @ApiOperation({ summary: 'Submit an application to a job' })
  @ApiSuccessResponse(ApplicationResponseDto, { status: 201 })
  @ApiCommonErrorResponses()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.applicationService.create(user.id, dto);
  }
}
```

## 2. Routing

- Class route = resource, plural, kebab-case.
- Method routes follow HTTP semantics: `@Get()`, `@Get(':id')`, `@Post()`, `@Patch(':id')`, `@Delete(':id')`.
- Non-CRUD actions use sub-paths.
- Use param pipes such as `ParseUUIDPipe`.

## 3. Input binding

- `@Body()` binds a validated request DTO.
- `@Query()` binds a query DTO.
- `@Param()` must be typed and piped.
- Identity comes from `@CurrentUser()`, never from a client-supplied body field.

## 4. Output

- Return the data object or response DTO only.
- The global `ResponseInterceptor` wraps successful responses into the standard envelope.
- Map entities to response DTOs in the service layer.
- Set non-default status codes with decorators like `@HttpCode(200)`.

## 5. Guards, roles, public

- Default-deny: protected by the global auth guard unless marked `@Public()`.
- Authorization stays declarative with `@Roles(...)`.

## 6. Swagger (required)

- Every endpoint uses `@ApiTags` and `@ApiOperation`.
- Prefer shared decorators from `@nexhire/shared`:
  - `@ApiSuccessResponse(...)`
  - `@ApiErrorResponses(...)`
  - `@ApiCommonErrorResponses()`
  - `@ApiPaginationQueries()` for standard `page` / `limit`
- Auth-protected routes still need `@ApiBearerAuth()`.
- Missing Swagger annotations is failing review.

## 7. API docs (required)

- Every FE-facing endpoint must be documented in `api-docs/<service>.md`.
- When adding, changing, or removing an endpoint, update the matching API docs file in the same change.
- API docs must include method/path, auth requirement, request params/query/body, success response, and expected error codes.
- Request/response fields in API docs must explicitly state required/optional and nullable/non-nullable behavior.
- Document the payload inside the standard response envelope.
- Swagger and `api-docs` must not disagree; if they do, update both before merging.

## 8. Errors

- Controllers do not swallow or remap errors.
- Let services throw typed `HttpException`s; the global filter formats them.

## 9. Versioning

- All routes live under the global prefix `api/v1`.
- Do not repeat versioning in each controller.
