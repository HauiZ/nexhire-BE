export type MatchRecommendation = 'STRONG_FIT' | 'GOOD_FIT' | 'PARTIAL_FIT' | 'LOW_FIT';
export type MatchDecision = 'SHORTLIST' | 'REVIEW_MANUALLY' | 'KEEP_WARM' | 'REJECT';
export type MatchPriority = 'HIGH' | 'NORMAL' | 'LOW';

export interface MatchExplanation {
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
