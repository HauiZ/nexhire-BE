import { ServiceUnavailableException } from '@nestjs/common';

export interface PoolApplication {
  id: string; jobId: string; candidateId: string; candidateCvId: string;
}

export function validateAi2Pool(payload: unknown, applications: PoolApplication[]) {
  const fail = (): never => { throw new ServiceUnavailableException('Invalid AI2 pool contract'); };
  if (!payload || typeof payload !== 'object') return fail();
  const value = payload as Record<string, any>;
  if (value.schemaVersion !== 'ai2-demo-pool-v1' || value.experimental !== true ||
      value.automaticallyReject !== false || value.hiringDecision !== null ||
      !['READY', 'UNAVAILABLE', 'DISABLED'].includes(value.status) ||
      value.requestedCount !== applications.length || !Array.isArray(value.items)) return fail();
  const common = { schemaVersion: 'ai2-demo-pool-v1' as const, experimental: true as const,
    automaticallyReject: false as const, hiringDecision: null, requestedCount: applications.length };
  if (value.status !== 'READY') {
    if (value.items.length || value.comparedCount !== 0) return fail();
    const allowed = ['DEMO_DISABLED', 'RESULTS_NOT_READY', 'DUPLICATE_APPLICATION_OR_CANDIDATE',
      'INCOMPATIBLE_SNAPSHOTS_OR_DATES', 'INCOMPATIBLE_MODEL', 'STALE_JOB_SNAPSHOT',
      'NEED_MORE_APPLICATIONS', 'POOL_SIZE_INVALID', 'INVALID_SCORE', 'CONTENT_QUALITY_NOT_VALIDATED'];
    return { ...common, status: value.status as 'DISABLED' | 'UNAVAILABLE', comparedCount: 0,
      items: [], reason: allowed.includes(value.reason) ? value.reason : 'RESULTS_NOT_READY' };
  }
  if (applications.length < 2 || value.items.length !== applications.length ||
      value.comparedCount !== applications.length || value.jobId !== applications[0].jobId ||
      value.modelVersion !== 'ai2-demo-xgb-observed-v1:5c0c5e3d4e81' ||
      value.tiePolicy !== 'EQUAL_SCORE_SHARED_RANK' ||
      !/^[a-f0-9]{64}$/.test(value.jobSnapshotSha256 ?? '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.referenceDate ?? '') ||
      !Number.isFinite(Date.parse(`${value.referenceDate}T00:00:00Z`)) ||
      new Date(`${value.referenceDate}T00:00:00Z`).toISOString().slice(0, 10) !== value.referenceDate) return fail();
  const seen = new Set<string>();
  let previousRank = 0;
  const items = value.items.map((item: any, index: number) => {
    const app = applications.find(row => row.id === item?.applicationId);
    if (!app || seen.has(app.id) || item.candidateId !== app.candidateId ||
        item.candidateCvId !== app.candidateCvId || typeof item.resultId !== 'string' || !item.resultId ||
        !Number.isInteger(item.rankingPosition) || item.rankingPosition < 1 ||
        (item.rankingPosition !== previousRank && item.rankingPosition !== index + 1)) return fail();
    seen.add(app.id); previousRank = item.rankingPosition;
    return { applicationId: app.id, candidateId: app.candidateId, candidateCvId: app.candidateCvId,
      resultId: item.resultId as string, rankingPosition: item.rankingPosition as number };
  });
  return { ...common, status: 'READY' as const, comparedCount: applications.length, items,
    jobId: value.jobId as string, referenceDate: value.referenceDate as string };
}
