# Test Flow Scripts

This folder contains lightweight local scripts for manually testing API flows.

## Rules

- Scripts are for local/dev verification only.
- Do not commit real tokens, passwords, CVs, certificates, or personal data.
- Prefer sample files in temporary folders.
- Unit tests still live beside modules under `apps/<service>/src/<module>/test/`.

## Project preflight

Run this before live API flow scripts:

```powershell
npm run test:flows:preflight
```

It checks required local env and whether service migrations are applied. If a service has pending
migrations, run the command shown by the script, for example:

```powershell
npm run db:company:run
```

Flow scripts may also run their own focused preflight and fail early before calling APIs.

## Cleanup generated test data

Most flow scripts clean up through public APIs by default. That means records may still remain in
the database as business history, for example withdrawn applications, closed jobs, suspended
companies, uploaded document metadata, and generated auth users.

The `npm run test:script ...` runner now also runs a post-flow DB cleanup automatically for known
generated test data. It assigns a `TEST_FLOW_RUN_ID` to the flow and the post-flow cleanup is scoped
to that run id, so it removes records created by the current run instead of sweeping every old
flow-test record. It runs after both successful and failed flows so partial test data does not
linger.

To keep data for debugging one run:

```powershell
$env:TEST_FLOW_CLEANUP_AFTER_RUN="false"
npm run test:script test\test-flows\test-application-api.ts
Remove-Item Env:\TEST_FLOW_CLEANUP_AFTER_RUN
```

You can also use a flow-specific keep flag such as `APPLICATION_TEST_KEEP_DATA=true`,
`COMPANY_JOB_FLOW_KEEP_DATA=true`, `AUTH_TEST_KEEP_DATA=true`, `CANDIDATE_TEST_KEEP_DATA=true`,
or `DOCUMENT_STORAGE_TEST_KEEP_DATA=true`.

To inspect matching generated test data across service databases without deleting anything:

```powershell
npm run test:flows:cleanup
```

To inspect one run id only:

```powershell
$env:TEST_FLOW_CLEANUP_RUN_ID="flow-run-id"
npm run test:flows:cleanup
Remove-Item Env:\TEST_FLOW_CLEANUP_RUN_ID
```

To delete matching local/dev flow-test records:

```powershell
$env:TEST_FLOW_CLEANUP_APPLY="true"
npm run test:flows:cleanup
Remove-Item Env:\TEST_FLOW_CLEANUP_APPLY
```

The manual cleanup command without `TEST_FLOW_CLEANUP_RUN_ID` sweeps all known flow-test markers,
which is useful for old leftover runs. Use dry-run first and only apply it against local/dev data.

The cleanup script only targets records with flow-test markers such as `auth-test-*`,
`candidate-test-*`, `document-test-*`, `flow-recruiter-*`, `NexHire Flow Company *`,
`Application Flow Company *`, `Backend Flow Job *`, `Remote Risk Flow Job *`, and
`Application Flow Job *`. It is intended for local/dev databases, not production.

## Document storage service

```powershell
npm run test:script test\test-flows\test-document-storage-api.ts
```

It covers:

- upload CV PDF
- metadata/key/presigned URL response shape
- missing file rejection
- invalid avatar MIME rejection

Optional env:

```powershell
$env:DOCUMENT_STORAGE_TEST_BASE_URL="http://localhost:3000/api/v1"
$env:DOCUMENT_STORAGE_TEST_OWNER_ID="b8b33c46-4bb0-4a33-8b0d-927e081a38a5"
$env:DOCUMENT_STORAGE_TEST_USER_ID="internal-test-user-id"
$env:DOCUMENT_STORAGE_TEST_USER_ROLE="CANDIDATE"
$env:DOCUMENT_STORAGE_TEST_KEEP_DATA="true"
```

Cleanup note: uploaded documents are tracked, but cleanup is informational until a document delete
API exists.

## Auth service

Run the default auth live-test flow:

```powershell
npm run test:script test\test-flows\test-auth-api.ts
```

By default this runs through the gateway at `http://localhost:3000/api/v1`.
To call auth-service directly instead, use `http://localhost:3001/api/v1`.

It covers:

- register candidate
- duplicate register rejection
- wrong-password login rejection
- login
- refresh token rotation
- logout and revoked refresh rejection
- change password
- old-password login rejection
- new-password login
- forgot password request

Optional env:

```powershell
$env:AUTH_TEST_BASE_URL="http://localhost:3000/api/v1"
$env:AUTH_TEST_KEEP_DATA="true"
```

Cleanup note: refresh tokens created by the flow are revoked by default. The generated auth user
is not deleted because auth-service does not expose a test cleanup/delete user API yet.

## Candidate service

```powershell
npm run test:script test\test-flows\test-candidate-api.ts
```

It covers:

- lazy-create/get current candidate profile aggregate
- aggregate profile patch
- replace collection semantics
- duplicate skill rejection
- avatar upload
- CV upload
- CV appears in profile aggregate
- optional internal application snapshot used by application-service
- optional saved job toggle flow

Optional env:

```powershell
$env:CANDIDATE_TEST_BASE_URL="http://localhost:3000/api/v1"
$env:CANDIDATE_TEST_USER_ID="b8b33c46-4bb0-4a33-8b0d-927e081a38a5"
$env:CANDIDATE_TEST_TOKEN="candidate-access-token"
$env:CANDIDATE_INTERNAL_TEST_BASE_URL="http://localhost:3002/api/v1"
$env:CANDIDATE_INTERNAL_TEST_TOKEN="dev-internal-service-token"
$env:CANDIDATE_TEST_JOB_ID="published-job-id"
$env:CANDIDATE_TEST_KEEP_DATA="true"
```

Cleanup note: saved-job state is removed by default when the saved-job optional flow runs. Uploaded
avatar/CV documents and the generated candidate profile are not deleted until delete/reset APIs
exist.

## Application service

```powershell
npm run test:script test\test-flows\test-application-api.ts
```

It covers:

- candidate applies to a published job
- duplicate active application is rejected
- candidate list/detail
- candidate CV download URL
- optional recruiter list/detail/CV checks
- withdraw application
- apply again after withdraw

Optional env:

```powershell
$env:APPLICATION_TEST_BASE_URL="http://localhost:3000/api/v1"
$env:APPLICATION_TEST_JOB_ID="published-job-id"
$env:APPLICATION_TEST_CANDIDATE_CV_ID="candidate-cv-id"
$env:APPLICATION_TEST_CANDIDATE_TOKEN="candidate-access-token"
$env:APPLICATION_TEST_CANDIDATE_USER_ID="candidate-user-id"
$env:APPLICATION_TEST_ADMIN_TOKEN="admin-access-token"
$env:APPLICATION_TEST_ADMIN_USER_ID="admin-user-id"
$env:APPLICATION_TEST_RECRUITER_TOKEN="recruiter-access-token"
$env:APPLICATION_TEST_RECRUITER_USER_ID="recruiter-user-id"
$env:APPLICATION_TEST_RECRUITER_COMPANY_ID="company-id"
$env:APPLICATION_TEST_KEEP_DATA="true"
```

If job/CV/token env is omitted, the script mints local JWTs from `JWT_ACCESS_SECRET`, creates an
approved company, publishes a job, uploads a candidate CV, and then runs the application flow.

Cleanup note: applications created by the flow are withdrawn by default. Set
`APPLICATION_TEST_KEEP_DATA=true` to inspect them after the run.

## Company -> job moderation -> admin review

```powershell
npm run test:script test\test-flows\test-company-job-moderation-api.ts
```

It covers:

- recruiter creates a company
- admin approves the company
- recruiter creates a complete draft job
- recruiter submits the job and moderation maps it to review status
- admin review queue contains the submitted job
- public readers cannot see the job before approval
- admin approves the job
- public list/detail can read the published job
- admin unpublish/republish hides and restores public visibility
- risky job content is classified as `SHOULD_REJECT`
- admin rejects the risky job with a reason

Optional env:

```powershell
$env:COMPANY_JOB_FLOW_BASE_URL="http://localhost:3000/api/v1"
$env:COMPANY_JOB_FLOW_ADMIN_TOKEN="admin-access-token"
$env:JWT_ACCESS_SECRET="local-gateway-access-secret"
$env:COMPANY_JOB_FLOW_RECRUITER_TOKEN="recruiter-access-token"
$env:COMPANY_JOB_FLOW_RECRUITER_REFRESH_TOKEN="recruiter-refresh-token"
$env:COMPANY_JOB_FLOW_RECRUITER_EMAIL="hr@company.vn"
$env:COMPANY_JOB_FLOW_RECRUITER_PASSWORD="StrongPassword123!"
$env:COMPANY_JOB_FLOW_RECRUITER_USER_ID="recruiter-user-id"
$env:COMPANY_JOB_FLOW_ADMIN_USER_ID="admin-user-id"
$env:COMPANY_JOB_FLOW_COMPANY_ID="already-approved-company-id"
$env:COMPANY_JOB_FLOW_KEEP_DATA="true"
```

When running through the gateway (`localhost:3000`), provide real recruiter/admin JWT tokens.
The `*_USER_ID` fallback headers are only useful for direct/trusted local service calls because
the gateway forwards identity from JWT, not from client-supplied identity headers.
If recruiter token is omitted and `JWT_ACCESS_SECRET` exists, the script mints a local test
recruiter JWT. After admin approves the created company, it mints a new recruiter JWT containing
`companyId`. If no JWT secret is available, the script falls back to registering/logging in a
recruiter with the provided `COMPANY_JOB_FLOW_RECRUITER_EMAIL`/`PASSWORD`, or generated test
credentials when omitted.

For admin auth, either provide `COMPANY_JOB_FLOW_ADMIN_TOKEN` or let the script mint a local test
admin JWT from `JWT_ACCESS_SECRET`. This is only for live script testing through the local gateway;
the public auth API still does not allow admin self-registration.

Cleanup is enabled by default. The script tries to close/delete generated jobs and suspends the
generated company after the flow. Set `COMPANY_JOB_FLOW_KEEP_DATA=true` when you want to inspect
the generated records. Recruiter users are not deleted because auth-service does not expose a
test cleanup/delete user API yet.

## Notification service

```powershell
npm run test:script test\test-flows\test-notification-api.ts
```

It covers:

- scoped unread count
- scoped notification list
- optional mark one notification as read
- optional mark all scoped notifications as read

Optional env:

```powershell
$env:NOTIFICATION_TEST_BASE_URL="http://localhost:3000/api/v1"
$env:NOTIFICATION_TEST_TOKEN="candidate-or-recruiter-access-token"
$env:NOTIFICATION_TEST_USER_ID="user-id"
$env:NOTIFICATION_TEST_USER_ROLE="CANDIDATE"
$env:NOTIFICATION_TEST_COMPANY_ID="company-id"
$env:NOTIFICATION_TEST_MUTATE_READS="true"
```

If token is omitted, the script mints a local JWT from `JWT_ACCESS_SECRET`.

Mutation note: read mutations are disabled by default because there is no API to mark
notifications unread again. Set `NOTIFICATION_TEST_MUTATE_READS=true` only when mutating the
current notification scope is acceptable.
