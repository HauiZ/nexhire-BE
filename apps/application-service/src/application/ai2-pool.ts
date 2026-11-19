import { ServiceUnavailableException } from '@nestjs/common';
import { Ai2CurrentPlan } from './ai2-demo.types';

export interface PoolApplication {
  id: string;
  jobId: string;
  candidateId: string;
  candidateCvId: string;
}

export const AI2_MODEL_VERSION = 'ai2-demo-xgb-observed-v1:5c0c5e3d4e81';
export const AI2_UNAVAILABLE_REASONS = [
  'DEMO_DISABLED',
  'RESULTS_NOT_READY',
  'DUPLICATE_APPLICATION_OR_CANDIDATE',
  'INCOMPATIBLE_SNAPSHOTS_OR_DATES',
  'INCOMPATIBLE_MODEL',
  'STALE_JOB_SNAPSHOT',
  'NEED_MORE_APPLICATIONS',
  'POOL_SIZE_INVALID',
  'INVALID_SCORE',
  'CONTENT_QUALITY_NOT_VALIDATED',
  'SOURCE_QUERY_V2_FEATURES_NOT_SUPPORTED',
  'STORED_INPUT_OR_ASSESSMENT_INCOMPATIBLE',
  'M1_NOT_READY',
  'CURRENT_PLAN_UNAVAILABLE',
  'CURRENT_PLAN_NOT_READY',
  'STALE_PLAN_BINDING',
  'INCOMPATIBLE_PLAN_BINDINGS',
  'REQUESTED_APPLICATION_NOT_ELIGIBLE',
  'CURRENT_CV_NOT_REVALIDATED',
  'CURRENT_CV_CHANGED',
  'CURRENT_CV_UNAVAILABLE',
];

export function ai2SourceFreshness(value: {
  sourceFreshness?: unknown;
  currentCvRevalidated?: unknown;
  sourceCheckedAt?: unknown;
}) {
  if (
    value.sourceFreshness === 'CURRENT_CV_REVALIDATED_AT_CHECK_TIME' &&
    value.currentCvRevalidated === true &&
    typeof value.sourceCheckedAt === 'string' &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value.sourceCheckedAt) &&
    Number.isFinite(Date.parse(value.sourceCheckedAt))
  )
    return {
      sourceFreshness: 'CURRENT_CV_REVALIDATED_AT_CHECK_TIME' as const,
      currentCvRevalidated: true as const,
      sourceCheckedAt: value.sourceCheckedAt,
    };
  if (
    (value.sourceFreshness === undefined &&
      value.currentCvRevalidated === undefined &&
      value.sourceCheckedAt === undefined) ||
    (value.sourceFreshness === 'STORED_MATCHING_SNAPSHOT_ONLY' &&
      value.currentCvRevalidated === false &&
      value.sourceCheckedAt === undefined)
  )
    return {
      sourceFreshness: 'STORED_MATCHING_SNAPSHOT_ONLY' as const,
      currentCvRevalidated: false as const,
    };
  throw new ServiceUnavailableException('Invalid AI2 source freshness contract');
}

export function ai2PoolUnavailable(requestedCount: number, reason: string) {
  return {
    schemaVersion: 'ai2-demo-pool-v1' as const,
    experimental: true as const,
    automaticallyReject: false as const,
    hiringDecision: null,
    requestedCount,
    status: 'UNAVAILABLE' as const,
    comparedCount: 0,
    items: [],
    reason,
    sourceFreshness: 'STORED_MATCHING_SNAPSHOT_ONLY' as const,
    currentCvRevalidated: false as const,
  };
}

/** Legacy unbound scores remain active only against an unchanged, explicitly unprepared JD. */
export function ai2PlanBindingReason(
  score: {
    jobId: string;
    jobSnapshotSha256?: string;
    inputContract?: unknown;
    planSchemaVersion?: unknown;
    planContentSha256?: unknown;
  },
  current?: Ai2CurrentPlan,
): string | null {
  if (!current || !/^[a-f0-9]{64}$/.test(current.current_job_snapshot_sha256 ?? ''))
    return 'CURRENT_PLAN_UNAVAILABLE';
  if (current.current_job_snapshot_sha256 !== score.jobSnapshotSha256) return 'STALE_JOB_SNAPSHOT';
  const v2 =
    score.inputContract !== undefined ||
    score.planSchemaVersion !== undefined ||
    score.planContentSha256 !== undefined;
  if (
    v2 &&
    (score.inputContract !== 'M1_REQUIREMENT_OBSERVATIONS_V1' ||
      score.planSchemaVersion !== 'jd-source-query-v2' ||
      typeof score.planContentSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(score.planContentSha256))
  )
    return 'INCOMPATIBLE_PLAN_BINDINGS';
  if (current.plan?.schema_version === 'jd-source-query-v2') {
    if (
      current.plan.job_id !== score.jobId ||
      current.status !== 'HR_CONFIRMED' ||
      current.plan.approval?.origin !== 'authenticated_hr'
    )
      return 'CURRENT_PLAN_NOT_READY';
    if (!v2 || current.content_sha256 !== score.planContentSha256) return 'STALE_PLAN_BINDING';
    return null;
  }
  if (v2) return 'STALE_PLAN_BINDING';
  if (current.status === 'UNPREPARED' && current.plan === null && current.content_sha256 === null)
    return null;
  if (current.plan) return 'STALE_PLAN_BINDING';
  return 'CURRENT_PLAN_NOT_READY';
}

export function validateAi2Pool(
  payload: unknown,
  applications: PoolApplication[],
  current?: Ai2CurrentPlan,
) {
  const fail = (): never => {
    throw new ServiceUnavailableException('Invalid AI2 pool contract');
  };
  if (!payload || typeof payload !== 'object') return fail();
  const value = payload as Record<string, unknown>;
  if (
    value.schemaVersion !== 'ai2-demo-pool-v1' ||
    value.experimental !== true ||
    value.automaticallyReject !== false ||
    value.hiringDecision !== null ||
    (value.status !== 'READY' && value.status !== 'UNAVAILABLE' && value.status !== 'DISABLED') ||
    value.requestedCount !== applications.length ||
    !Array.isArray(value.items)
  )
    return fail();
  const common = {
    schemaVersion: 'ai2-demo-pool-v1' as const,
    experimental: true as const,
    automaticallyReject: false as const,
    hiringDecision: null,
    requestedCount: applications.length,
    ...ai2SourceFreshness(value),
  };
  if (value.status !== 'READY') {
    if (value.items.length || value.comparedCount !== 0) return fail();
    return {
      ...common,
      status: value.status,
      comparedCount: 0,
      items: [],
      reason:
        typeof value.reason === 'string' && AI2_UNAVAILABLE_REASONS.includes(value.reason)
          ? value.reason
          : 'RESULTS_NOT_READY',
    };
  }
  if (!common.currentCvRevalidated)
    return ai2PoolUnavailable(applications.length, 'CURRENT_CV_NOT_REVALIDATED');
  if (
    applications.length < 2 ||
    applications.length > 50 ||
    value.items.length !== applications.length ||
    value.comparedCount !== applications.length ||
    value.jobId !== applications[0].jobId ||
    value.modelVersion !== AI2_MODEL_VERSION ||
    value.tiePolicy !== 'EQUAL_SCORE_SHARED_RANK' ||
    typeof value.jobSnapshotSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.jobSnapshotSha256) ||
    typeof value.referenceDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.referenceDate) ||
    !Number.isFinite(Date.parse(`${value.referenceDate}T00:00:00Z`)) ||
    new Date(`${value.referenceDate}T00:00:00Z`).toISOString().slice(0, 10) !== value.referenceDate
  )
    return fail();
  if (
    new Set(applications.map((app) => app.id)).size !== applications.length ||
    new Set(applications.map((app) => app.candidateId)).size !== applications.length ||
    applications.some((app) => app.jobId !== value.jobId || !app.candidateCvId)
  )
    return fail();
  const bindingReason = ai2PlanBindingReason(
    {
      jobId: value.jobId,
      jobSnapshotSha256: value.jobSnapshotSha256,
      inputContract: value.inputContract,
      planSchemaVersion: value.planSchemaVersion,
      planContentSha256: value.planContentSha256,
    },
    current,
  );
  if (bindingReason) return ai2PoolUnavailable(applications.length, bindingReason);
  const seen = new Set<string>();
  let previousRank = 0;
  const items = value.items.map((raw: unknown, index) => {
    if (!raw || typeof raw !== 'object') return fail();
    const item = raw as Record<string, unknown>;
    const app = applications.find((row) => row.id === item.applicationId);
    if (
      !app ||
      seen.has(app.id) ||
      item.candidateId !== app.candidateId ||
      item.candidateCvId !== app.candidateCvId ||
      typeof item.resultId !== 'string' ||
      !item.resultId ||
      typeof item.rankingPosition !== 'number' ||
      !Number.isInteger(item.rankingPosition) ||
      item.rankingPosition < 1 ||
      (item.rankingPosition !== previousRank && item.rankingPosition !== index + 1)
    )
      return fail();
    seen.add(app.id);
    previousRank = item.rankingPosition;
    return {
      applicationId: app.id,
      candidateId: app.candidateId,
      candidateCvId: app.candidateCvId,
      resultId: item.resultId,
      rankingPosition: item.rankingPosition,
    };
  });
  return {
    ...common,
    status: 'READY' as const,
    comparedCount: applications.length,
    items,
    jobId: value.jobId,
    referenceDate: value.referenceDate,
    modelVersion: AI2_MODEL_VERSION,
    jobSnapshotSha256: value.jobSnapshotSha256,
    ...(value.inputContract === 'M1_REQUIREMENT_OBSERVATIONS_V1'
      ? {
          inputContract: value.inputContract as 'M1_REQUIREMENT_OBSERVATIONS_V1',
          planSchemaVersion: 'jd-source-query-v2' as const,
          planContentSha256: value.planContentSha256 as string,
        }
      : {}),
    ...(value.evaluationMode === 'LOCAL_DEMO_ONLY' && value.contentQualityValidated === false
      ? { evaluationMode: 'LOCAL_DEMO_ONLY' as const, contentQualityValidated: false as const }
      : {}),
  };
}
