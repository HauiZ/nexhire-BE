# 07 — DTO Patterns

## 1. Always use DTOs

- Every request body, query, and route param group is bound to a DTO class. No raw objects, no `any`.
- DTOs are classes (not interfaces) so `class-validator` / `class-transformer` decorators work at runtime.

## 2. Request DTOs (validated input)

```ts
// apps/job/src/job/dto/create-job.dto.ts
export class CreateJobDto {
  @ApiProperty({ example: 'Backend Engineer' })
  @IsString()
  @Length(3, 120)
  title: string;

  @ApiProperty({ example: 'Build NestJS microservices' })
  @IsString()
  @MaxLength(5000)
  description: string;

  @ApiProperty({ enum: JobType })
  @IsEnum(JobType)
  type: JobType;

  @ApiPropertyOptional({ example: 1500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMin?: number;
}
```

- Decorate every field with the right `class-validator` rule. Validation is enforced by the global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`).
- Use `@IsOptional()` for optional fields; mark them `?`. Use `@IsEnum` for enum fields (don't accept arbitrary strings).
- Don't include server-controlled fields (`id`, `createdAt`, `ownerId`, `status`) in a create DTO — those are set by the service.

## 3. Update DTOs

```ts
export class UpdateJobDto extends PartialType(CreateJobDto) {}
```

- Use `PartialType` (from `@nestjs/swagger`) to derive update DTOs; don't duplicate fields.
- For `PATCH`, all fields optional; for `PUT`, require the full shape.

## 4. Query DTOs (pagination/filter)

```ts
export class FindJobsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @IsOptional() @IsEnum(JobStatus)
  status?: JobStatus;
}
```

- Use `@Type(() => Number)` because query strings arrive as text. Clamp `limit` (max 100) in the DTO.

## 5. Response DTOs (output shape)

- Define an explicit response DTO; never return the entity directly. This controls exactly what's exposed.

```ts
export class JobResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: JobStatus }) status: JobStatus;
  @ApiProperty() createdAt: string;
}
```

## 6. Mapping entity ↔ DTO

- Map in the service layer using a small mapper/`static` method. Keep mapping in one place per entity.

```ts
export class JobMapper {
  static toResponse(job: Job): JobResponseDto {
    return { id: job.id, title: job.title, status: job.status, createdAt: job.createdAt.toISOString() };
  }
}
```

- Alternatively use `class-transformer` `@Expose()/@Exclude()` + `plainToInstance`, but pick one approach per project and be consistent.

## 7. Cross-service contract DTOs

- DTOs describing the request/response between services live in `@nexhire/shared/dto`, so producer and consumer share one definition.

## 8. Rules

- No business logic in DTOs — only shape + validation.
- Every DTO field has an `@ApiProperty`/`@ApiPropertyOptional` for Swagger.
- Don't reuse a request DTO as a response DTO; inputs and outputs evolve differently.
