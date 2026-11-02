import { validateAi2Pool } from '../ai2-pool';

const apps = [
  { id: 'a', jobId: 'j', candidateId: 'ca', candidateCvId: 'va' },
  { id: 'b', jobId: 'j', candidateId: 'cb', candidateCvId: 'vb' },
];
const ready = () => ({ schemaVersion: 'ai2-demo-pool-v1', experimental: true,
  automaticallyReject: false, hiringDecision: null, requestedCount: 2, comparedCount: 2,
  status: 'READY', jobId: 'j', jobSnapshotSha256: 'a'.repeat(64), referenceDate: '2026-10-30',
  modelVersion: 'ai2-demo-xgb-observed-v1:5c0c5e3d4e81', tiePolicy: 'EQUAL_SCORE_SHARED_RANK',
  items: apps.map((a, i) => ({ applicationId: a.id, candidateId: a.candidateId,
    candidateCvId: a.candidateCvId, resultId: `r${i}`, rankingPosition: i + 1 })),
});

describe('AI2 pool boundary', () => {
  it('allowlists valid ranking and shared ties', () => {
    const value = ready(); value.items[1].rankingPosition = 1;
    expect(validateAi2Pool(value, apps).items.map(x => x.rankingPosition)).toEqual([1, 1]);
    expect(validateAi2Pool({ ...value, privateSource: 'secret' }, apps)).not.toHaveProperty('privateSource');
  });
  it.each(['candidateId', 'candidateCvId', 'applicationId'])('rejects foreign %s', field => {
    const value = ready(); (value.items[0] as any)[field] = 'foreign';
    expect(() => validateAi2Pool(value, apps)).toThrow();
  });
  it('rejects partial pools and impossible ranks', () => {
    expect(() => validateAi2Pool({ ...ready(), items: [] }, apps)).toThrow();
    const value = ready(); value.items[0].rankingPosition = 2;
    expect(() => validateAi2Pool(value, apps)).toThrow();
  });
});
