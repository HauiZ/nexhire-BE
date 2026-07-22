# Cache Strategy

This document tracks runtime caches that are intentionally used in NexHire BE.

## Principles

- Cache read-heavy data only when short stale windows are acceptable.
- Do not cache write flows or flows with important side effects.
- Never cache private data under a key that does not include the owner/user scope.
- Signed document URLs must be cached for less than their provider expiry.
- Public caches should be invalidated when the same service changes the public surface.

## Current Caches

| Service | Scope | Store | Key | TTL | Invalidation | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| `candidate-service` | Document signed URL | Redis | `candidate:document-download:{documentId}` | `expiresInSeconds - 60s` | Expiry only | Avoid repeated document-storage calls for avatar/CV URLs |
| `company-service` | Document signed URL | Redis | `company:document-download:{documentId}` | `expiresInSeconds - 60s` | Expiry only | Avoid repeated document-storage calls for logo/hero/verification docs |
| `job-service` | Document signed URL | Redis | `job:document-download:{documentId}` | `expiresInSeconds - 60s` | Expiry only | Avoid repeated document-storage calls for company logo/hero URLs |
| `application-service` | CV document signed URL | Redis | `application:document-download:{documentId}` | `expiresInSeconds - 60s` | Expiry only | Avoid repeated document-storage calls when recruiters/candidates reopen CV views |
| `job-service` | Public job list/search | Redis | `job:public-cache:v{version}:{query}` | 30s | Job public cache version increment | Reduce DB/search provider work for guest/candidate search pages |
| `job-service` | Public company jobs | Redis | `job:public-cache:v{version}:{companyId + query}` | 30s | Job public cache version increment | Reduce repeated company profile job list reads |
| `job-service` | Featured companies | Redis | `job:public-cache:v{version}:{limit}` | 30s | Job public cache version increment | Reduce repeated home page featured company aggregation |
| `job-service` | Home stats | Redis | `job:public-cache:v{version}:home-stats` | 30s | Job public cache version increment | Reduce repeated home page count queries |
| `job-service` | Public categories | Redis | `job:public-categories` | 30s | TTL only | Reduce repeated category/sidebar count aggregation |

## Public Job Cache Invalidation

`job-service` invalidates public job caches by incrementing Redis key `job:public-cache:version`.
Cache entries include that version in their key, so old entries become unreachable and expire naturally.

The version increments when these flows change public-facing job data:

- Published jobs expire through scheduler.
- Recruiter updates a job.
- Admin reviews a job into or out of public flow.
- Admin approves a major revision that updates the published job.
- Company snapshot changes are synced into jobs.
- Application submitted event increments `applicationCount`.
- Recruiter soft deletes a job.
- Recruiter/admin unpublishes, republishes, or closes a job.

Category cache currently uses TTL-only invalidation. This is acceptable because category data is public UI support data and a 30 second stale count is acceptable. If category management APIs are added later, those writes should clear the category public cache too.

## Notes For FE

- FE should not depend on cache freshness for critical actions.
- After applying to a job, FE should trust the application API response and candidate-specific saved/applied endpoints, not public home/list counters.
- Signed URLs may change between requests. FE should store and use them only for the current viewing session.
- If a signed URL fails due to expiry, FE should request the relevant API again instead of retrying the old URL.

## Redis Notes

Redis-backed caches are fail-open: if Redis is unavailable, the service logs a warning and falls back to DB/upstream calls.

Current Redis-backed caches:

- `candidate-service` document signed URLs for avatar/CV.
- `company-service` document signed URLs for logo/hero/verification docs.
- `job-service` document signed URLs for public company logo/hero.
- `application-service` CV document download URLs.
- `job-service` public job list/search, public company jobs, featured companies, home stats, and categories.

All current application-level caches documented above are Redis-backed. Redis is provided by `RedisModule.forRoot()` from `@nexhire/infra`.

## Do Not Cache

- CV parsing result application into candidate profile.
- Application status/stage transitions.
- Admin review/moderation decisions in write flows.
- Job posting permission checks.
- Candidate/recruiter private dashboard responses unless keys include user/company scope and invalidation is well defined.
