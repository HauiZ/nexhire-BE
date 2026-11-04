# Matching-service regression tests

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
