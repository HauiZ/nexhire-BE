# 05 — Controller Patterns

## 1. Controllers are thin

A controller only: routes the request → binds/validates input via DTO → calls a service → returns the result. **No business logic, no DB access, no external calls.**

```ts
@ApiTags('applications')
@Controller('applications')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Post()
  @ApiOperation({ summary: 'Submit an application to a job' })
  @ApiResponse({ status: 201, type: ApplicationResponseDto })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.applicationService.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an application by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ApplicationResponseDto> {
    return this.applicationService.findOne(id);
  }
}
```

## 2. Routing

- Class route = resource, plural, kebab-case: `@Controller('job-posts')`.
- Method routes match HTTP semantics: `@Get()`, `@Get(':id')`, `@Post()`, `@Patch(':id')`, `@Delete(':id')`.
- Non-CRUD actions as sub-paths: `@Post(':id/advance-stage')`.
- Use param pipes: `@Param('id', ParseUUIDPipe)`. Never trust raw params.

## 3. Input binding

- `@Body()` → a request DTO (validated). `@Query()` → a query DTO (pagination/filter). `@Param()` → typed + piped.
- Never accept `any` or read the raw `@Req()` body. The global `ValidationPipe` enforces DTO rules.
- Identity comes from `@CurrentUser()` (set by auth guard), NEVER from a client-supplied `userId` in the body.

## 4. Output

- Return the data object/DTO; the global **response interceptor** wraps it into the standard envelope (`09-error-handling.md`). Do not manually build `{ success, data }` in every method.
- Map entities → response DTOs in the service layer; controllers should already receive response-shaped data.
- Set status codes via decorators when non-default: `@HttpCode(200)` for an action `POST`.

## 5. Guards, roles, public

- Default-deny: protected by the global `JwtAuthGuard`. Mark open endpoints with `@Public()`.
- Authorization via `@Roles(UserRole.RECRUITER)` + the roles guard. Keep authorization declarative on the route.

```ts
@Post()
@Roles(UserRole.RECRUITER)
create(@CurrentUser() user: AuthUser, @Body() dto: CreateJobDto) { ... }
```

## 6. Swagger (required)

- Every endpoint: `@ApiTags`, `@ApiOperation`, `@ApiResponse` (with the response DTO type). Auth-protected routes: `@ApiBearerAuth()`.
- Missing Swagger annotations = failing review.

## 7. Errors

- Don't try/catch to swallow in controllers. Let services throw typed `HttpException`s; the global filter formats them.

## 8. Versioning

- All routes live under the global prefix `api/v1` (set in `main.ts`). Don't repeat the version in each controller.
