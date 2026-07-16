# Company -> Job Moderation -> Admin Review Flow

Tai lieu nay mo ta flow hien tai tu luc company/recruiter dang job den khi moderation phan loai va admin duyet job. Muc tieu la de teammate nam dung rule da chot va doi chieu voi code hien tai.

## 1. Nguyen tac da chot

- Company phai duoc admin duyet `APPROVED` moi duoc tao/submitt job.
- Company `SUSPENDED`, `PENDING`, `REJECTED` khong duoc posting job moi.
- Draft job van phai du field bat buoc. Khong co che do draft thieu field.
- Moderation chi phan loai rui ro va dua ra goi y cho admin, khong auto publish va khong auto reject job.
- Admin la nguoi quyet dinh cuoi cung: approve thi job moi len public, reject thi job bi tu choi.
- Guest/candidate chi xem duoc job co status `PUBLISHED`.
- Company trust level la thong tin noi bo/admin-only, khong hien thi cho candidate/public.

## 2. Company approval va posting eligibility

Company-service la source of truth cho trang thai company va trust level.

Flow company:

1. Recruiter tao company profile.
2. Company co status ban dau `PENDING`.
3. Admin verify company:
   - `APPROVE` -> company status `APPROVED`, recruiter co the posting job.
   - `REJECT` -> company status `REJECTED`, recruiter khong duoc posting job.
4. Admin co the suspend company:
   - `SUSPENDED` -> job-service se an/chan cac job dang public hoac dang review cua company do.
5. Admin co the restore company ve `PENDING` de review lai.

Company-service publish event `company.posting-snapshot-changed` khi snapshot thay doi:

```json
{
  "companyId": "uuid",
  "ownerUserId": "uuid",
  "companyName": "NexHire Tech",
  "companyLogoUrl": "https://example.com/logo.png",
  "companyStatus": "APPROVED",
  "previousCompanyStatus": "PENDING",
  "companyTrustLevel": "MEDIUM",
  "changedAt": "2026-07-16T10:00:00.000Z"
}
```

Consumers chinh:

- auth-service: sync recruiter owner -> `companyId` de JWT/refresh token co company ownership moi nhat.
- job-service: update snapshot company tren jobs, update full-text search, va chuyen job/revision sang `SHOULD_REJECT` neu company khong con approved.
- notification-service: gui notification in-app cho owner khi status company thay doi.

## 3. Recruiter tao draft job

Endpoint:

```text
POST /api/v1/recruiter/jobs
```

Dieu kien:

- User phai co role `RECRUITER`.
- JWT phai co `companyId`.
- Job-service van goi company-service internal endpoint de lay snapshot moi nhat:

```text
GET /api/v1/internal/companies/:id/posting-snapshot
```

Field bat buoc:

- `title`
- `description`
- `requirements`
- `skills`
- `employmentType`
- `workingType`
- `experienceLevel`
- `location`

Field optional/nullable:

- `benefits`
- `categoryId`
- `salaryMin`
- `salaryMax`
- `salaryCurrency`
- `isSalaryVisible`
- `deadline`
- `numberOfOpenings`

Validation quan trong:

- `salaryMin <= salaryMax` neu ca hai cung co.
- `deadline` phai nam trong tuong lai.
- Company snapshot phai la `APPROVED`.
- Company `SUSPENDED` bi chan rieng voi error company suspended.

Ket qua:

- Job duoc tao voi status `DRAFT`.
- Job luu snapshot company: `companyId`, `companyName`, `companyLogoUrl`, `companyStatus`, `companyTrustLevel`, `companySnapshotAt`.
- Job luu search fields de phuc vu PostgreSQL full-text search.

## 4. Recruiter submit job de moderation va admin review

Endpoint:

```text
POST /api/v1/recruiter/jobs/:id/submit
```

Dieu kien:

- Job phai thuoc company cua recruiter.
- Job phai dang `DRAFT`.
- Company snapshot moi nhat van phai `APPROVED`.

Khi submit:

1. Job-service lay lai company posting snapshot moi nhat.
2. Job-service chay `JobModerationService.moderate(job, company)`.
3. Moderation tinh `riskScore`, `riskLevel`, `decision`, `reasons`, `matchedRules`.
4. Job-service luu ban ghi `JobModerationReview`.
5. Job status duoc set theo moderation decision:

| Risk level | Moderation decision | Job status | Y nghia |
| --- | --- | --- | --- |
| `LOW` | `PENDING_REVIEW` | `PENDING_REVIEW` | Noi dung on, van cho admin duyet |
| `MEDIUM` | `NEEDS_REVIEW` | `NEEDS_REVIEW` | Can admin soi ky hon |
| `HIGH` | `NEEDS_REVIEW` | `NEEDS_REVIEW` | Rui ro cao, admin can can nhac |
| `CRITICAL` | `SHOULD_REJECT` | `SHOULD_REJECT` | He thong khuyen nghi reject, admin van la nguoi quyet dinh |

Luu y quan trong: khong co status nao tu moderation tu dong thanh `PUBLISHED`.

## 5. Moderation scoring hien tai

Moderation dang check cac nhom rui ro:

- Keyword lua dao/de dang co thu nhap cao: `viec nhe luong cao`, `khong can kinh nghiem luong cao`, `cam ket thu nhap`, ...
- Yeu cau nop tien/phi/dat coc: `dong phi`, `phi ho so`, `dat coc`, `chuyen khoan truoc`, `nap tien`, ...
- Day ung vien ra kenh ngoai: `telegram`, `zalo rieng`, `inbox rieng`, `lien he ngoai he thong`, ...
- Link rui ro: link rut gon, qua nhieu external links, external form.
- Giay to/thong tin nhay cam qua som: `cccd`, `cmnd`, `so ho khau`, anh the ngan hang, so tai khoan ngan hang.
- Noi dung thieu minh bach: mo ta qua ngan, requirements yeu, missing location.
- Salary bat thuong theo experience level.
- Spam signals: title all caps, qua nhieu ky tu dac biet, lap keyword.
- Cross-signal: remote job + yeu cau nop tien, internship + no-experience + salary qua cao.
- Company trust:
  - `LOW` trust cong them 20 risk score.
  - `MEDIUM/HIGH` hien tai khong tru diem, chi khong bi cong rui ro.

Threshold hien tai:

| Risk score | Risk level | Decision |
| ---: | --- | --- |
| `0 - 24` | `LOW` | `PENDING_REVIEW` |
| `25 - 49` | `MEDIUM` | `NEEDS_REVIEW` |
| `50 - 79` | `HIGH` | `NEEDS_REVIEW` |
| `80 - 100` | `CRITICAL` | `SHOULD_REJECT` |

## 6. Admin review job

Endpoints:

```text
GET  /api/v1/admin/jobs/review-queue
POST /api/v1/admin/jobs/:id/review
```

Review queue gom:

- `PENDING_REVIEW`
- `NEEDS_REVIEW`
- `SHOULD_REJECT`

Admin review body:

```json
{
  "decision": "APPROVE",
  "reason": "Company and content verified."
}
```

Rules:

- `APPROVE` -> job status `PUBLISHED`, set `publishedAt` neu chua co.
- `REJECT` -> job status `REJECTED`.
- `REJECT` bat buoc co `reason`.
- `APPROVE` bi chan neu company snapshot tren job khong phai `APPROVED`.
- Sau review, job-service update ban ghi moderation review voi admin decision/reason.

Events sau admin review:

- Neu approve job:
  - publish `job.published`.
- Moi review job/revision:
  - publish `job.review-trust-signal` de company-service auto tinh trust.

## 7. Public read

Endpoints:

```text
GET /api/v1/jobs
GET /api/v1/jobs/:id
```

Rules:

- Public list/detail chi doc job status `PUBLISHED`.
- Public list tra ve lightweight card: `title`, `companyId`, `companyName`, `companyLogoUrl`, salary/location/experience va cac thong tin can de candidate click.
- Detail moi tra ve day du description, requirements, benefits, skills.
- Khong expose moderation, review reason, application count, company trust level.

Search hien tai:

- PostgreSQL full-text search tren `title`, `description`, `requirements`, `skills`, company snapshot name va `location`.
- `skills` query dung OR matching, roi rank job match nhieu skill len truoc.
- Query filters co `employmentType`, `workingType`, `experienceLevel`, `categoryId`, salary, location, sort.

## 8. Update published job va major revision

Minor fields duoc update truc tiep tren published job:

- `deadline`
- `numberOfOpenings`
- `isSalaryVisible`

Major fields:

- `title`
- `description`
- `requirements`
- `skills`
- `benefits`
- `categoryId`
- `employmentType`
- `workingType`
- `experienceLevel`
- `location`
- `salaryMin`
- `salaryMax`
- `salaryCurrency`

Rules:

- Published job doi major field truc tiep se bi chan.
- Neu published job da co application, recruiter tao major revision.
- Revision la full snapshot va cung phai du field.
- Revision submit cung chay moderation va vao queue admin.
- Admin approve revision thi apply snapshot vao job, tang `version`, publish `job.revision-approved`.
- Admin reject revision thi public job hien tai giu nguyen.

## 9. Unpublish, republish, close, delete, expire

Recruiter/admin co the:

- `unpublish`: `PUBLISHED -> UNPUBLISHED`, an khoi public page, application hien co van giu de recruiter xu ly.
- `republish`: `UNPUBLISHED -> PUBLISHED` neu company snapshot van `APPROVED`.
- `close`: `PUBLISHED/UNPUBLISHED -> CLOSED`, dung tuyen dung va publish `job.closed`.
- `delete`: soft delete, chi cho `DRAFT`, `REJECTED`, `UNPUBLISHED` khong co application.

Scheduler:

- Job-service sweep theo `JOB_EXPIRATION_SWEEP_INTERVAL_MS`, default 300000ms.
- Published job qua deadline se thanh `EXPIRED`, an khoi public page.
- Application da nop van de recruiter xu ly.

## 10. Trust level automation

Company trust level hien co:

- `LOW`
- `MEDIUM`
- `HIGH`

Admin co the update trust level thu cong va phai nhap reason. Moi thay doi duoc luu vao trust history.

Auto trust tu `job.review-trust-signal`:

- Positive signal: admin `APPROVE` va moderation `LOW`.
- Negative signal: admin `REJECT`.
- Admin approve job risk `MEDIUM/HIGH/CRITICAL` la neutral, vi admin da manual review va thay chap nhan duoc.
- 5 positive signals tang 1 bac trust: `LOW -> MEDIUM -> HIGH`.
- 3 negative signals giam 1 bac trust: `HIGH -> MEDIUM -> LOW`.
- Duplicate event duoc dedupe theo `targetType + targetId`.

## 11. API docs audit

Hien tai docs lien quan da co:

- `api-docs/company-service.md`: da co company approval, suspend/restore, trust level, trust history, internal posting snapshot, published/consumed events.
- `api-docs/job-service.md`: da co create/submit/review/public search/revision/unpublish/republish/close/delete/expire, company snapshot event, application submitted event, internal snapshots.
- `api-docs/notification-service.md`: da co notification cho application va company verification/status.
- `api-docs/auth-service.md`: da co JWT/recruiter company link flow lien quan auth.

Can luu y:

- Job docs phai giu major fields khop code, bao gom `skills`.
- Chua co mot tai lieu api-docs tong hop end-to-end, file nay dong vai tro flow plan cho teammate.

## 12. Unit test audit

Da co unit test chinh:

- `apps/job-service/src/job/test/job-moderation.service.spec.ts`
  - safe content -> `PENDING_REVIEW`
  - suspicious remote income -> `NEEDS_REVIEW`
  - upfront payment scam -> `SHOULD_REJECT`
- `apps/job-service/src/job/test/job.service.spec.ts`
  - block direct major update tren published job
  - application submitted event tang application count va dedupe
  - application snapshot applyable/not applyable
  - close job publish event
  - expire published jobs
- `apps/job-service/src/job/company/test/company-snapshot.service.spec.ts`
  - lay approved posting snapshot tu company-service
  - block non-approved company snapshot
- `apps/company-service/src/company/test/company.service.spec.ts`
  - create/update/verify company
  - manual trust update va trust history
  - auto increase/decrease trust
  - approved high-risk neutral
  - duplicate trust signal dedupe
  - public profile an unapproved company

Moi bo sung:

- Unit test cho `skills` la major field, published job khong duoc update truc tiep.
- Unit test cho submit draft -> moderation -> review record -> status mapping.
- Unit test cho admin approve job -> publish event + trust signal.
- Unit test cho reject job bat buoc co reason.
- Unit test cho sync `company.posting-snapshot-changed` lam job/revision thanh `SHOULD_REJECT` khi company khong approved.
- Unit test cho public detail khong expose moderation/internal fields.
- Unit test cho approve major revision -> apply snapshot vao job -> publish revision event + trust signal.
- Unit test cho low-trust company cong risk score nhung khong auto reject safe content.

Con co the bo sung sau neu can rat sat RabbitMQ/e2e:

- Unit test truc tiep cho consumer parse/ack/nack event payload.
- Integration/e2e test voi RabbitMQ that de verify event delivery giua company-service/job-service/notification-service.
- Public search provider test rieng cho ranking PostgreSQL full-text neu can dong bang SQL behavior.

## 13. Test-flow script audit

Da co live test-flow scripts trong `test/test-flows/`:

- auth-service
- candidate-service
- application-service
- document-storage-service
- notification-service

Da bo sung script rieng:

```powershell
npm run test:script test\test-flows\test-company-job-moderation-api.ts
```

Script cover:

- company create -> admin approve company
- recruiter create draft job
- submit job -> moderation -> review status
- admin review queue
- public detail bi an truoc approval
- admin approve job
- guest list/detail public job
- admin unpublish/republish
- risky job -> `SHOULD_REJECT`
- admin reject risky job voi reason

Con co the bo sung sau:

- close/expire live edge cases.
- major revision live review flow.
- company suspend event live flow lam job bi an/should reject.
