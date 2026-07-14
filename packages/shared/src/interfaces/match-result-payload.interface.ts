export type MatchRecommendation = 'STRONG_FIT' | 'GOOD_FIT' | 'PARTIAL_FIT' | 'LOW_FIT';

export interface MatchExplanation {
  matchedSkills: string[];
  missingSkills: string[];
  strongSignals: string[];
  weakSignals: string[];
  recommendation: MatchRecommendation;
}
