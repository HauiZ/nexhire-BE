# NexHire API Docs

Folder này là API contract thủ công để FE dễ gắn API mà không cần đọc toàn bộ Swagger hoặc backend code.

## Quy tắc cập nhật

- Mỗi service có một file riêng trong `api-docs/`.
- Khi thêm/sửa/xóa API, phải cập nhật file tương ứng trong cùng change.
- Docs mô tả payload bên trong response envelope chuẩn.
- Không ghi secret, token thật, password thật, hoặc dữ liệu nhạy cảm thật vào example.
- Nếu API cần auth, ghi rõ role và header/identity requirement.
- Nếu API gọi qua gateway, path public là `/api/v1/<resource>`.
- Nếu API chỉ dùng internal service-to-service, ghi rõ `Internal only`.

## Response envelope chuẩn

Success:

```json
{
  "success": true,
  "data": {}
}
```

Paginated success:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "AUTH.INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "details": {}
  }
}
```

## File index

| Service | File |
| ------- | ---- |
| Gateway | [gateway.md](gateway.md) |
| Auth Service | [auth-service.md](auth-service.md) |
| Candidate Service | [candidate-service.md](candidate-service.md) |
| Company Service | [company-service.md](company-service.md) |
| Job Service | [job-service.md](job-service.md) |
| Application Service | [application-service.md](application-service.md) |
| CV Parsing Service | [cv-parsing-service.md](cv-parsing-service.md) |
| Matching Service | [matching-service.md](matching-service.md) |
| Notification Service | [notification-service.md](notification-service.md) |
| Document Storage Service | [document-storage-service.md](document-storage-service.md) |

## Current endpoint inventory

FE-facing business endpoints currently documented:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verification`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/change-password`
- `GET /api/v1/candidates/me`
- `PATCH /api/v1/candidates/me`
- `PATCH /api/v1/candidates/me/avatar`
- `POST /api/v1/cvs/upload`
- `POST /api/v1/documents/upload`
- `GET /api/v1/jobs`
- `GET /api/v1/jobs/:id`
- `POST /api/v1/recruiter/jobs`
- `GET /api/v1/recruiter/jobs`
- `GET /api/v1/recruiter/jobs/:id`
- `PATCH /api/v1/recruiter/jobs/:id`
- `DELETE /api/v1/recruiter/jobs/:id`
- `POST /api/v1/recruiter/jobs/:id/submit`
- `POST /api/v1/recruiter/jobs/:id/unpublish`
- `POST /api/v1/recruiter/jobs/:id/republish`
- `POST /api/v1/recruiter/jobs/:id/close`
- `POST /api/v1/recruiter/jobs/:jobId/revisions`
- `PATCH /api/v1/recruiter/jobs/:jobId/revisions/:revisionId`
- `POST /api/v1/recruiter/jobs/:jobId/revisions/:revisionId/submit`
- `GET /api/v1/admin/jobs/review-queue`
- `POST /api/v1/admin/jobs/:id/review`
- `POST /api/v1/admin/jobs/:id/unpublish`
- `POST /api/v1/admin/jobs/:id/republish`
- `POST /api/v1/admin/jobs/:id/close`
- `GET /api/v1/admin/jobs/revision-review-queue`
- `POST /api/v1/admin/jobs/revisions/:revisionId/review`
- `POST /api/v1/applications`
- `GET /api/v1/applications/me`
- `GET /api/v1/applications/me/:id`
- `GET /api/v1/applications/me/:id/cv`
- `POST /api/v1/applications/me/:id/withdraw`
- `GET /api/v1/recruiter/applications`
- `GET /api/v1/recruiter/applications/:id`
- `GET /api/v1/recruiter/applications/:id/cv`
- `PATCH /api/v1/recruiter/applications/:id/status`
- `GET /api/v1/saved-jobs`
- `POST /api/v1/saved-jobs/:jobId`
- `DELETE /api/v1/saved-jobs/:jobId`
- `GET /api/v1/saved-jobs/status`
- `GET /api/v1/saved-jobs/:jobId/status`
- `GET /api/v1/notifications`
- `GET /api/v1/notifications/unread-count`
- `PATCH /api/v1/notifications/read-all`
- `PATCH /api/v1/notifications/:id/read`
- `GET /api/v1/health`

Scaffold controllers without business endpoints yet:

- `candidate-service`: `saved-jobs`
- `company-service`: `companies`, `hr-accounts`
- `cv-parsing-service`: `cv-parsing`
- `job-service`: `categories`
- `matching-service`: `matching`
- `notification-service`: `notifications/email`, `notifications/web-push`
- `auth-service`: `tokens`, `permissions`

Internal service health endpoints exist in each service when running directly, but FE should normally use gateway health: `GET /api/v1/health`.

## Endpoint section template

Use [_endpoint-template.md](_endpoint-template.md) when adding a new endpoint.
