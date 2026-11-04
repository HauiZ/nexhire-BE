export type MatchRecommendation = 'STRONG_FIT' | 'GOOD_FIT' | 'PARTIAL_FIT' | 'LOW_FIT';
export type MatchDecision = 'SHORTLIST' | 'REVIEW_MANUALLY' | 'KEEP_WARM' | 'REJECT';
export type MatchPriority = 'HIGH' | 'NORMAL' | 'LOW';

/** Runtime aggregate scoring is unavailable until AI2 supplies a new contract. */
export interface UnavailableMatchScore {
  scoringStatus: 'NOT_AVAILABLE';
  totalScore: null;
  matchLevel: null;
}

export function isUnavailableMatchScore<T>(value: T): value is T & UnavailableMatchScore {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.scoringStatus === 'NOT_AVAILABLE' &&
    payload.totalScore === null &&
    payload.matchLevel === null
  );
}

export interface MatchHrEvidence {
  evidenceId: string;
  source: string;
  text: string;
  similarityScore: number;
  reasonCodes?: string[];
  scoreMeaning: 'COSINE_RETRIEVAL_SIMILARITY_NOT_SUPPORT_PROBABILITY';
}

export type MatchHrSuggestion =
  | 'matched'
  | 'partial'
  | 'not_established_in_provided_evidence'
  | null;

export type MatchAi1RetrievalStatus =
  | 'NO_EVIDENCE'
  | 'SCORER_UNAVAILABLE'
  | 'REVIEW_REQUIRED'
  | 'CANDIDATE_EVIDENCE'
  | 'INSUFFICIENT_SIGNAL';

export interface MatchAi1Requirement {
  requirementId: string;
  text: string;
  retrievalStatus: MatchAi1RetrievalStatus;
  evidence: MatchHrEvidence[];
  reasonCodes: string[];
  supportStatus: null;
  verifiedSupport: false;
  allOf: string[][] | null;
  jointContextRequired: boolean | null;
  components: Array<{
    componentId: string;
    text: string;
    importance: string;
    retrievalStatus: MatchAi1RetrievalStatus;
    evidence: MatchHrEvidence[];
    reasonCodes: string[];
    supportStatus: null;
    verifiedSupport: false;
  }> | null;
}

export interface MatchAi1Assessment {
  schemaVersion: 'ai1-evidence-v1';
  status: 'READY' | 'DISABLED' | 'UNAVAILABLE';
  backend: 'disabled' | 'local_m1';
  reason: string;
  jobId: string;
  candidateId: string;
  candidateCvId: string | null;
  jobSnapshotSha256: string;
  candidateSnapshotSha256: string;
  modelVersion: string | null;
  weightsSha256: string | null;
  manifestSha256: string | null;
  planStatus: string;
  fixedPlan: Record<string, unknown> | null;
  requirements: MatchAi1Requirement[];
  truncatedTexts: number;
  candidateSupportVerified: false;
  automaticallyReject: false;
  isTrainingLabel: false;
  verifierUsed: false;
}

export interface MatchHrReview {
  schemaVersion: 'hr-review-v1';
  resultId: string;
  applicationId: string | null;
  jobId: string;
  candidateId: string;
  candidateCvId: string | null;
  executionStatus: string;
  assessmentStatus: 'PENDING_REVIEW' | 'NOT_PERFORMED' | 'UNAVAILABLE';
  reason: string;
  scope: 'RETRIEVED_EVIDENCE_ONLY';
  decisionAuthority: 'HR';
  candidateSupportVerified: false;
  automaticallyReject: false;
  isTrainingLabel: false;
  overallFitScore: null;
  hiringDecision: null;
  rankingPosition: null;
  planStatus: string | null;
  planContentSha256: string | null;
  planStateScope: 'AT_MATCHING_TIME';
  currentPlanRevalidated: false;
  jobSnapshotSha256: string | null;
  candidateSnapshotSha256: string | null;
  syntheticTestOnly: boolean | null;
  retrievalModelVersion: string | null;
  verifierModelVersion: string | null;
  assessmentSource?: 'M1_RETRIEVAL' | 'VERIFIER_DIAGNOSTIC' | null;
  retrievalWarnings?: string[];
  requirements: Array<{
    requirementId: string;
    text: string;
    modelSuggestion: MatchHrSuggestion;
    retrievalStatus?: string | null;
    reasonCodes?: string[];
    jointContextRequired?: boolean | null;
    verifiedSupport: false;
    evidence: MatchHrEvidence[];
    componentAnalysis: 'NOT_PERFORMED' | 'FIXED_PLAN_UNVERIFIED_PROPOSALS' | 'FIXED_PLAN_RETRIEVAL';
    allOf: string[][] | null;
    components: Array<{
      componentId: string;
      text: string;
      importance: string;
      modelSuggestion: MatchHrSuggestion;
      retrievalStatus?: string | null;
      reasonCodes?: string[];
      verifiedSupport: false;
      evidence: MatchHrEvidence[];
    }> | null;
  }>;
  baselineDiagnostics: null | {
    meaning: string;
    totalScore: number;
    matchLevel: string;
    decision: string | null;
    recommendation: string | null;
    modelVersion: string | null;
  };
}

export interface MatchRankingFeatures {
  semantic_score: number;
  skill_score: number;
  experience_score: number;
  education_score: number;
  project_score: number;
  certification_score: number;
  location_score: number;
  level_score: number;
}

export interface MatchRequirementEvidence {
  requirementId: string;
  requirement: string;
  requirementSource: string;
  evidence: string | null;
  evidenceSource: string | null;
  evidenceId: string | null;
  comparisonScore: number | null;
  comparisonMethod: 'EXACT' | 'CONTAINMENT' | 'SEMANTIC' | 'LEXICAL' | null;
  score: number;
  status: 'MATCHED' | 'PARTIAL' | 'NOT_FOUND';
}

export interface MatchModelMetadata {
  featureSchemaVersion: string | null;
  semanticModelVersion: string | null;
  rankingModelVersion: string | null;
  preprocessingVersion: string | null;
  featureExtractorVersion: string | null;
  scoreReferenceDate: string | null;
  dataOrigin: 'PROFILE' | 'PARSED_CV' | null;
  candidateSnapshotHash: string | null;
  jobSnapshotHash: string | null;
  featureLimitations: string[];
}

export interface MatchExplanation {
  ai1Assessment?: MatchAi1Assessment | null;
  requirementMatches?: MatchRequirementEvidence[];
  rankingFeatures?: MatchRankingFeatures | null;
  featureSchemaVersion?: string | null;
  semanticModelVersion?: string | null;
  rankingModelVersion?: string | null;
  preprocessingVersion?: string | null;
  featureExtractorVersion?: string | null;
  scoreReferenceDate?: string | null;
  dataOrigin?: 'PROFILE' | 'PARSED_CV' | null;
  candidateSnapshotHash?: string | null;
  jobSnapshotHash?: string | null;
  featureLimitations?: string[];
  matchedSkills: string[];
  missingSkills: string[];
  strongSignals: string[];
  weakSignals: string[];
  recommendation: MatchRecommendation;
  decision?: MatchDecision;
  priority?: MatchPriority;
  summary?: string | null;
  nextActions?: string[];
  riskFlags?: string[];
}
