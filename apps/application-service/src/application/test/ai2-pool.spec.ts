import { validateAi2Pool } from '../ai2-pool';
import { Ai2CurrentPlan } from '../ai2-demo.types';

const apps = [
  { id: 'a', jobId: 'j', candidateId: 'ca', candidateCvId: 'va' },
  { id: 'b', jobId: 'j', candidateId: 'cb', candidateCvId: 'vb' },
];
const ready = () => ({
  schemaVersion: 'ai2-demo-pool-v1',
  experimental: true,
  automaticallyReject: false,
  hiringDecision: null,
  requestedCount: 2,
  comparedCount: 2,
  status: 'READY',
  sourceFreshness: 'CURRENT_CV_REVALIDATED_AT_CHECK_TIME',
  currentCvRevalidated: true,
  sourceCheckedAt: '2026-11-18T06:00:00Z',
  jobId: 'j',
  jobSnapshotSha256: 'a'.repeat(64),
  referenceDate: '2026-10-30',
  modelVersion: 'ai2-demo-xgb-observed-v1:5c0c5e3d4e81',
  tiePolicy: 'EQUAL_SCORE_SHARED_RANK',
  items: apps.map((a, i) => ({
    applicationId: a.id,
    candidateId: a.candidateId,
    candidateCvId: a.candidateCvId,
    resultId: `r${i}`,
    rankingPosition: i + 1,
  })),
});
const current = (): Ai2CurrentPlan => ({
  status: 'UNPREPARED',
  current_job_snapshot_sha256: 'a'.repeat(64),
  content_sha256: null,
  plan: null,
});
const v2Plan = (): Ai2CurrentPlan => ({
  status: 'HR_CONFIRMED',
  current_job_snapshot_sha256: 'a'.repeat(64),
  content_sha256: 'b'.repeat(64),
  plan: {
    schema_version: 'jd-source-query-v2',
    job_id: 'j',
    approval: { origin: 'authenticated_hr' },
  },
});
const v2 = () => ({
  ...ready(),
  inputContract: 'M1_REQUIREMENT_OBSERVATIONS_V1',
  planSchemaVersion: 'jd-source-query-v2',
  planContentSha256: 'b'.repeat(64),
});

describe('AI2 pool boundary', () => {
  it('allowlists valid ranking and shared ties', () => {
    const value = ready();
    value.items[1].rankingPosition = 1;
    expect(validateAi2Pool(value, apps, current()).items.map((x) => x.rankingPosition)).toEqual([
      1, 1,
    ]);
    expect(
      validateAi2Pool({ ...value, privateSource: 'secret' }, apps, current()),
    ).not.toHaveProperty('privateSource');
  });
  it('preserves explicit unvalidated local demo markers', () => {
    const output = validateAi2Pool(
      { ...ready(), evaluationMode: 'LOCAL_DEMO_ONLY', contentQualityValidated: false },
      apps,
      current(),
    );
    expect(output).toMatchObject({
      evaluationMode: 'LOCAL_DEMO_ONLY',
      contentQualityValidated: false,
    });
    expect(output.items).toHaveLength(2);
  });
  it.each(['candidateId', 'candidateCvId', 'applicationId'] as const)(
    'rejects foreign %s',
    (field) => {
      const value = ready();
      value.items[0][field] = 'foreign';
      expect(() => validateAi2Pool(value, apps, current())).toThrow();
    },
  );
  it('rejects partial pools and impossible ranks', () => {
    expect(() => validateAi2Pool({ ...ready(), items: [] }, apps, current())).toThrow();
    const value = ready();
    value.items[0].rankingPosition = 2;
    expect(() => validateAi2Pool(value, apps, current())).toThrow();
  });
  it('accepts only the exact existing model plus M1 requirement-observation input contract and same current HR-confirmed plan', () => {
    expect(validateAi2Pool(v2(), apps, v2Plan())).toMatchObject({
      status: 'READY',
      modelVersion: 'ai2-demo-xgb-observed-v1:5c0c5e3d4e81',
      inputContract: 'M1_REQUIREMENT_OBSERVATIONS_V1',
      planSchemaVersion: 'jd-source-query-v2',
      planContentSha256: 'b'.repeat(64),
    });
    expect(() =>
      validateAi2Pool({ ...v2(), modelVersion: 'new-unapproved' }, apps, v2Plan()),
    ).toThrow();
    for (const field of ['inputContract', 'planSchemaVersion', 'planContentSha256'] as const) {
      const value: Partial<ReturnType<typeof v2>> = v2();
      delete value[field];
      expect(validateAi2Pool(value, apps, v2Plan())).toMatchObject({
        status: 'UNAVAILABLE',
        comparedCount: 0,
        items: [],
      });
    }
  });
  it('never ranks stale/current-unconfirmed or schema-switched v2 pools or v1 results under a new current v2 plan', () => {
    for (const plan of [
      undefined,
      { ...v2Plan(), status: 'DRAFT' },
      { ...v2Plan(), content_sha256: 'c'.repeat(64) },
      { ...v2Plan(), current_job_snapshot_sha256: 'c'.repeat(64) },
      current(),
    ])
      expect(validateAi2Pool(v2(), apps, plan)).toMatchObject({
        status: 'UNAVAILABLE',
        comparedCount: 0,
        items: [],
      });
    expect(validateAi2Pool(ready(), apps, v2Plan())).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'STALE_PLAN_BINDING',
      items: [],
    });
  });
  it('rejects duplicate candidates/mixed jobs and preserves safe upstream all-or-none reasons without source leakage', () => {
    expect(() =>
      validateAi2Pool(
        ready(),
        [apps[0], { ...apps[1], candidateId: apps[0].candidateId }],
        current(),
      ),
    ).toThrow();
    expect(() =>
      validateAi2Pool(ready(), [apps[0], { ...apps[1], jobId: 'other' }], current()),
    ).toThrow();
    for (const reason of [
      'M1_NOT_READY',
      'SOURCE_QUERY_V2_FEATURES_NOT_SUPPORTED',
      'INCOMPATIBLE_PLAN_BINDINGS',
    ])
      expect(
        validateAi2Pool(
          { ...ready(), status: 'UNAVAILABLE', items: [], comparedCount: 0, reason },
          apps,
        ),
      ).toMatchObject({ status: 'UNAVAILABLE', reason, items: [] });
    expect(
      validateAi2Pool(
        { ...ready(), status: 'UNAVAILABLE', items: [], comparedCount: 0, reason: '/private/path' },
        apps,
      ),
    ).toMatchObject({ reason: 'RESULTS_NOT_READY' });
  });
});

describe('AI2 current CV freshness', () => {
  it('hides a ready pool when current CV was not revalidated', () => {
    expect(
      validateAi2Pool(
        {
          ...ready(),
          sourceFreshness: 'STORED_MATCHING_SNAPSHOT_ONLY',
          currentCvRevalidated: false,
          sourceCheckedAt: undefined,
        },
        apps,
        current(),
      ),
    ).toMatchObject({ status: 'UNAVAILABLE', reason: 'CURRENT_CV_NOT_REVALIDATED', items: [] });
  });
  it('rejects a claimed revalidation without check time', () => {
    expect(() =>
      validateAi2Pool({ ...ready(), sourceCheckedAt: undefined }, apps, current()),
    ).toThrow();
  });
});
