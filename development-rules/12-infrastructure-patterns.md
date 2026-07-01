# 12 - Infrastructure Patterns

## 1. Reusable adapters

Reusable adapters live in `@nexhire/infra`.
Single-consumer clients stay in the owning service.

## 2. Storage

- `document-storage-service` is the boundary between business services and object storage.
- MinIO/S3 access goes through `StorageModule` and `StorageService` from `@nexhire/infra`.
- Business services should call `document-storage-service`, not the storage SDK directly.

## 3. Messaging

- RabbitMQ is the async backbone for long-running work.
- Notifications, AI parsing, matching, and document lifecycle events should be event-driven when possible.

## 4. HTTP clients

- Sync inter-service calls use typed clients over `HttpService`.
- Use timeouts, retries, and request-id propagation.
