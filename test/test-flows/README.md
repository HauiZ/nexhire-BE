# Test Flow Scripts

This folder contains lightweight local scripts for manually testing API flows.

## Rules

- Scripts are for local/dev verification only.
- Do not commit real tokens, passwords, CVs, certificates, or personal data.
- Prefer sample files in temporary folders.
- Unit tests still live beside modules under `apps/<service>/src/<module>/test/`.

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
```

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

## Candidate service

```powershell
npm run test:script test\test-flows\test-candidate-api.ts
```

It covers:

- lazy-create/get current candidate profile aggregate
- aggregate profile patch
- replace collection semantics
- duplicate skill rejection

Optional env:

```powershell
$env:CANDIDATE_TEST_BASE_URL="http://localhost:3000/api/v1"
$env:CANDIDATE_TEST_USER_ID="b8b33c46-4bb0-4a33-8b0d-927e081a38a5"
```
