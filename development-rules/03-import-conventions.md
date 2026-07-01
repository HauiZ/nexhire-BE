# 03 - Import Conventions

## 1. Path aliases

- Use package aliases for shared code:
  - `@nexhire/shared` for contracts, decorators, guards, filters, interceptors, DTO helpers, enums, constants.
  - `@nexhire/infra` for reusable adapters to backing systems such as DB, Redis, queues, storage, and HTTP helpers.
- Never import shared packages through deep relative paths such as `../../../../packages/shared`.
- Within an app, relative imports are fine for nearby files. If a relative import climbs more than two levels, reconsider the folder boundary or promote the contract to `@nexhire/shared`.

```ts
// good
import { UserRole, CurrentUser } from '@nexhire/shared';

// bad
import { UserRole } from '../../../packages/shared/src/enums/user-role.enum';
```

## 2. Import order

Order imports top to bottom with a blank line between groups:

1. Node built-ins (`node:crypto`, `node:fs`).
2. Third-party packages (`@nestjs/common`, `typeorm`, `class-validator`).
3. Workspace packages (`@nexhire/shared`, `@nexhire/infra`).
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

- Within each group, keep imports alphabetized when practical.
- Do not fight Prettier formatting.

## 3. Barrel files

- `packages/shared` exposes its public surface via `src/index.ts`.
- Only export APIs that other services are allowed to use.
- Do not create barrels inside app feature folders just for convenience; import the concrete file.

## 4. No circular dependencies

- Circular imports are forbidden.
- If two features need the same shape, extract a DTO/interface/enum to `@nexhire/shared`.
- If two providers depend on each other, rethink the module boundary instead of using direct imports or runtime hacks.

## 5. Type-only imports

- Use `import type { ... }` for values used only as types.
- This keeps runtime imports smaller and avoids accidental circular runtime dependencies.

```ts
import type { CvParseResult } from '@nexhire/shared';
```

## 6. No third-party internals

- Import from a package public entry point, not from `dist`, `src`, or private internals.
- Example: import from `typeorm`, not `typeorm/browser/...`.

## 7. Inter-service communication is not an import

- A service never imports another service app's controller/service/entity to call it.
- Cross-service calls go through HTTP clients, events, or queues.
- Only contracts are shared through `@nexhire/shared`.
