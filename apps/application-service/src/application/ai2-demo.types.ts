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
  reason?: string;
}
