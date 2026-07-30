# Internal API Boundary

This document tracks service-to-service HTTP APIs after moving important async flows to RabbitMQ.

## Keep As Internal HTTP

These calls are request/response queries or file operations where the caller needs the result immediately.

| Owner service              | Endpoint                                                                                | Used by                              | Reason                                                           |
| -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `document-storage-service` | `POST /api/v1/documents/upload`                                                         | candidate, company                   | Upload must return `documentId` immediately.                     |
| `document-storage-service` | `GET /api/v1/internal/documents/:id/download-url`                                       | candidate, company, job, application | Short-lived URL is generated on demand.                          |
| `document-storage-service` | `GET /api/v1/internal/documents/:id/metadata`                                           | company                              | Admin/recruiter review needs metadata immediately.               |
| `document-storage-service` | `DELETE /api/v1/internal/documents/:id`                                                 | candidate cleanup                    | Physical delete is a direct storage command.                     |
| `application-service`      | `GET /api/v1/internal/applications/cv-documents/:documentId/retention`                  | candidate cleanup                    | Delete decision needs a synchronous answer.                      |
| `job-service`              | `GET /api/v1/internal/jobs/:id/application-snapshot`                                    | application                          | Application creation validates current job state.                |
| `job-service`              | `GET /api/v1/internal/jobs/:id/saved-snapshot`                                          | candidate                            | Still synchronous for saved/followed job snapshots.              |
| `candidate-service`        | `GET /api/v1/internal/candidates/users/:userId/cvs/:candidateCvId/application-snapshot` | application                          | Application creation needs current candidate/CV state.           |
| `auth-service`             | `GET /api/v1/internal/auth/users/:id/contact-snapshot`                                  | candidate                            | Fallback for profile contact email.                              |
| `company-service`          | `GET /api/v1/internal/companies/:id/posting-snapshot`                                   | job, candidate                       | Fallback only; job-service now prefers local event-fed snapshot. |
| `cv-parsing-service`       | `POST /api/v1/internal/cv-parsing/template-fill`                                        | candidate                            | Template fill is synchronous and returns parsed payload.         |

## Replaced Or Reduced By Event Bus

| Old dependency                                                   | New path                                                                                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `candidate-service -> cv-parsing-service` for profile CV parsing | `candidate-service` publishes `cv.uploaded`; `cv-parsing-service` consumes it.                                                                |
| `cv-parsing-service -> candidate-service` to apply parsed resume | `cv-parsing-service` publishes `cv.parsed`; `candidate-service` consumes it.                                                                  |
| `cv-parsing-service -> candidate-service` to mark parse failed   | `cv-parsing-service` publishes `cv.parse-failed`; `candidate-service` consumes it.                                                            |
| `job-service -> company-service` for posting snapshot            | `job-service` reads local `company_posting_snapshots` first, populated by `company.posting-snapshot-changed`; internal HTTP remains fallback. |
