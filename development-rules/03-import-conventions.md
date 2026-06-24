# 03 — Import Conventions

## 1. Path aliases

- Use `@nexhire/shared` for the shared package. NEVER reach across with relative paths like `../../../../packages/shared`.

```ts
// good
import { UserRole, JwtAuthGuard } from '@nexhire/shared';

// bad
import { UserRole } from '../../../packages/shared/src/enums/user-role.enum';
```

- Within an app, relative imports are fine for nearby files (`./dto/create-job.dto`). If a relative path climbs more than two levels (`../../..`), it's a smell — reconsider structure or promote to `shared`.

## 2. Import order (top → bottom, blank line between groups)

1. Node built-ins (`node:crypto`, `node:fs`).
2. Third-party packages (`@nestjs/common`, `typeorm`, `class-validator`).
3. Workspace packages (`@nexhire/shared`).
4. Relative imports within the app (`./`, `../`).

```ts
import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ApplicationStage } from '@nexhire/shared';

import { Application } from './entities/application.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
```

- Within each group, sort alphabetically (let ESLint/Prettier import-sort enforce it).

## 3. Barrel files (`index.ts`)

- `packages/shared` exposes its public surface via `src/index.ts`. Only export what other services should use.
- Do NOT create barrels inside an app's feature folders just for convenience — they encourage circular imports and obscure the dependency graph. Import the concrete file.

## 4. No circular dependencies

- A circular import (`a.service` ↔ `b.service`) is forbidden. If two services depend on each other's classes, extract the shared contract/interface to `shared`, or rethink the boundary.
- Inject via the module/DI container; do not import a provider instance directly to "break" a cycle.

## 5. Type-only imports

- Use `import type { ... }` for things used only as types (DTO shapes, interfaces). Keeps runtime imports minimal and avoids accidental circular runtime deps.

```ts
import type { CvParseResult } from '@nexhire/shared';
```

## 6. No deep imports into third-party internals

- Import from a package's public entry, not its `dist`/internal paths (`typeorm`, not `typeorm/browser/...`).

## 7. Inter-service communication is not an import

- A service NEVER imports another service's `*.service.ts` to call it. Cross-service calls go through HTTP (`HttpModule`) or a queue. Only **contracts** (DTO/enum/interface) are shared, via `@nexhire/shared`.
