export interface Ai2DemoScore {
  schemaVersion: 'ai2-demo-score-v1';
  applicationId: string;
  jobId: string;
  candidateId: string;
  candidateCvId: string | null;
  resultId: string;
  status: 'DISABLED' | 'UNAVAILABLE' | 'READY';
  score: number | null;
  scoreMeaning: 'RELATIVE_RANKING_SCORE';
  experimental: true;
  rankingPosition: null;
  automaticallyReject: false;
  hiringDecision: null;
  attributionStatus: 'UNAVAILABLE';
  modelVersion?: string;
  jobSnapshotSha256?: string;
  candidateSnapshotSha256?: string;
  referenceDate?: string;
  inputContract?: 'M1_REQUIREMENT_OBSERVATIONS_V1';
  planSchemaVersion?: 'jd-source-query-v2';
  planContentSha256?: string;
  sourceFreshness?: 'STORED_MATCHING_SNAPSHOT_ONLY' | 'CURRENT_CV_REVALIDATED_AT_CHECK_TIME';
  currentCvRevalidated?: boolean;
  sourceCheckedAt?: string;
  reason?: string;
}

/** Current job-service inspection, read at request time; not atomic cross-service freshness. */
export interface Ai2CurrentPlan {
  status: string;
  current_job_snapshot_sha256: string;
  content_sha256: string | null;
  plan: null | { schema_version: string; job_id: string; approval?: { origin?: string } | null };
}
