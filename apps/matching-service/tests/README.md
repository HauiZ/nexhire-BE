# Matching-service regression tests

## Private candidate preparation (2026-11-09)

`test_candidate_preparation.py` covers public requirement selection, source-only output, internal token rejection, oversized/malformed parse input, query-token limits, disabled AI and busy-inference rejection. Full Python regression receipt: 617 passed, 2 skipped.

The opt-in cross-repository browser integration is launched from BE root:

```sh
RUN_CANDIDATE_BROWSER_TEST=1 npx jest --runInBand --runTestsByPath apps/candidate-service/src/candidate/test/preparation.browser.spec.ts
```

Requires the existing matching venv, pinned local M1 bundle, sibling Nexthire-FE dependencies and installed Chrome. It runs actual Nest preparation controller/service and FastAPI/M1, with synthetic ownership/public-job/parse-storage dependencies and internal identity headers (not real JWT/DB/upload/parser E2E). It checks identity/role/UUID rejection, private source display, recheck and mobile overflow. No provider calls, DB migration or application persistence. Screenshot is temporary under FE node_modules/.tmp.

The 13 test modules here protect the current API/worker, M1 evidence retrieval,
HR projection, JD plans, snapshot boundaries and the original model-readiness
contracts. Offline scorer/ranking preparation tests remain for reproducibility;
they do not enable baseline scoring in the application.

From the repository root:

```powershell
npm run matching:test
```

The tests use synthetic inputs and mocked model loading; they do not need a
provider API, downloads or a live business database. The Windows symlink test
can skip when symlink creation is unavailable.

The 37 historical experiment tests were archived with their original paths at
`D:\Project\NexHire Archive\cleanup-006\backend`. That directory contains a
SHA256 manifest and restore instructions. Restore the whole historical test
group before reproducing an old experiment: tests share fixture helpers and
some depend on the preserved local `training/` tree. Do not run archived files
directly from their archive paths because they resolve resources relative to
their original location.
