# 08 — Entity Patterns (TypeORM)

## 1. Base entity

Every table inherits common audit columns from `BaseEntity` in `@nexhire/infra`:

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
import { BaseEntity } from '@nexhire/infra';
import { JobStatus } from '@nexhire/shared';

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

## 3. Database isolation (DB-per-service)

- Each service owns its **own database** (`auth_db`, `job_db`, `cvapp_db`, `ai_db`) on one Postgres instance, with its **own DB user** granted only to that database. No shared database, no schema sharing.
- A service connects only to its own DB (`databaseConfigFor('<PREFIX>')` + `buildTypeOrmOptions()` from `@nexhire/infra`). Cross-database access is impossible in plain SQL and blocked by per-user grants — that is the isolation guarantee.
- An entity belongs to exactly one service/database.
- **Cross-service references store the ID only** (`companyId`, `userId`, `jobId`) — never a `@ManyToOne` relation to another service's entity, never a duplicated copy. To read another service's data, call its API or react to its events.

## 4. Relations (within the same database only)

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
- Schema changes go through a migration in `apps/<service>/src/migrations/`. **Don't hand-write** — generate from the entity diff, **review the SQL**, then commit.
- Both `up()` and `down()` implemented and reversible. Never edit a merged migration — add a new one.
- Run order is fixed: `auth → job → cv-app → ai` (`scripts/migrate.sh`); the per-service databases are created first by `scripts/init-databases.sql` (auto-run by docker-compose on a fresh volume, or `make migrate-db`). Each service migrates **its own** database via `apps/<service>/data-source.ts`.

### Workflow (use `scripts/migration.sh`)

```bash
# 1. edit / add an entity, then auto-generate the migration (diffs entity vs DB)
bash scripts/migration.sh generate auth AddPhoneToUser
#    → apps/auth/src/migrations/<timestamp>-AddPhoneToUser.ts  (up + down)

# 2. review the generated SQL, then apply it
bash scripts/migration.sh run auth

# other commands
bash scripts/migration.sh revert auth      # roll back the last migration
bash scripts/migration.sh show   auth      # show applied / pending
bash scripts/migration.sh create auth Seed # empty migration to hand-write (rare)
```

- `generate` needs the DB running (`make dev`) and reachable — it compares your entities against the live schema. Run existing migrations first so the diff is accurate.
- `service` is one of `auth | job | cv-app | ai`. Each diffs only its own schema via `apps/<service>/data-source.ts`.
- `npm run mig -- generate auth AddPhoneToUser` is an equivalent alias.
- Hand-written (`create`) migrations are only for things the diff can't express (data backfills, custom SQL).

## 7. Rules

- No business logic / queries inside entity classes — entities are data shape only.
- Don't expose entities directly over HTTP; map to response DTOs (`07-dto-patterns.md`).
- Store `enum`/status as the TS enum value; keep the enum in `shared` if other services reference it.
- AI results (in `ai_db`) store: source CV/application id, the model name + version, the score/JSON output, and a timestamp — so results are auditable and reproducible.
