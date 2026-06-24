# 08 — Entity Patterns (TypeORM)

## 1. Base entity

Every table inherits common audit columns. Define a base class in `@nexhire/shared`:

```ts
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;
}
```

- PK is always `uuid` (`id`), never auto-increment int.
- Use **soft delete** (`@DeleteDateColumn`) for user-facing domain data (user, job, cv, application).

## 2. Entity definition

```ts
// apps/job/src/job/entities/job.entity.ts
@Entity({ name: 'job_post' })
export class Job extends BaseEntity {
  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string; // reference by ID only (company lives in auth service)

  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.OPEN })
  status: JobStatus;

  @Index('idx_job_post_status')
  @Column({ name: 'is_featured', type: 'boolean', default: false })
  isFeatured: boolean;
}
```

- Map every property to a snake_case column with explicit `name` when names differ.
- Specify `type` explicitly; specify `length` for `varchar`.
- Enums stored as Postgres `enum` (or varchar) using a TS enum from `shared`.

## 3. Schema isolation

- An entity belongs to exactly one service/schema. The service's TypeORM config sets `schema: <service>_schema`.
- **Cross-service references store the ID only** (`companyId`, `userId`, `jobId`) — never a `@ManyToOne` relation to another service's entity, never a duplicated copy.

## 4. Relations (within the same schema only)

```ts
@OneToMany(() => Application, (app) => app.job)
applications: Application[];

@ManyToOne(() => Cv, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'cv_id' })
cv: Cv;
```

- Define both sides explicitly when needed. Set `onDelete` deliberately.
- **Avoid `eager: true`** — load relations on demand with `relations: [...]` to prevent over-fetching and N+1.

## 5. Indexing & constraints

- Index FK columns and any column used in list-endpoint `WHERE`/`ORDER BY` (`status`, `candidateId`).
- Unique constraints for natural keys: `@Index('uq_user_email', ['email'], { unique: true })`.
- Enforce NOT NULL / UNIQUE / FK at the DB level, not only in code.

## 6. Migrations only — no `synchronize`

- `synchronize: false` in every environment, always.
- Schema changes go through a migration in `apps/<service>/src/migrations/`. Generate, **review the SQL**, then commit.
- Both `up()` and `down()` implemented and reversible. Never edit a merged migration — add a new one.
- Run order is fixed: `auth → job → cv-app` (`scripts/migrate.sh`); schemas created first (`scripts/create-schemas.sql`).

## 7. Rules

- No business logic / queries inside entity classes — entities are data shape only.
- Don't expose entities directly over HTTP; map to response DTOs (`07-dto-patterns.md`).
- Store `enum`/status as the TS enum value; keep the enum in `shared` if other services reference it.
- AI results (`ai_schema`) store: source CV/application id, the model name + version, the score/JSON output, and a timestamp — so results are auditable and reproducible.
