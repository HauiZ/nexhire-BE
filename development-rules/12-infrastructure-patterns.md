# 12 - Infrastructure Patterns

## 1. Reusable adapters

- Reusable adapters live in `@nexhire/infra`.
- Single-consumer clients stay in the owning service.
- Apps should depend on adapter interfaces/services, not raw SDK calls scattered through business code.

## 2. Databases

- PostgreSQL runs as one local infra instance, but DB-owning services each use their own database.
- Local host port is `5436`; container port is `5432`.
- `synchronize` is always false.
- Schema changes go through migrations.

## 3. Storage

- `document-storage-service` is the boundary between business services and object storage.
- MinIO/S3 access goes through `StorageModule` and `StorageService` from `@nexhire/infra` or through the document-storage service.
- Business services should call `document-storage-service`, not the storage SDK directly.

## 4. Messaging

- RabbitMQ is the async backbone for domain events.
- Routing keys are constants in `@nexhire/shared`.
- Producers publish events; consumers bind queues to routing keys.
- Queue names are config values, not hardcoded.
- Email, AI parsing, matching, and document lifecycle work should be event-driven when possible.
- Consumers must log failures and choose explicit ack/nack behavior.

## 5. HTTP clients

- Sync inter-service calls use typed client wrappers over `HttpService`.
- Use timeouts, request-id propagation, and explicit error conversion.
- Do not call another app by importing its service class.

## 6. Local infra

- `docker-compose.yml` is for infrastructure only: Postgres, RabbitMQ, Redis, MinIO.
- Application services run with `npm run start:*` or `npm run start:all`.
- `.env.example` must match exposed compose ports.
