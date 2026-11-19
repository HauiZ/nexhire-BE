import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class JobRecommendationsQueryDto {
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 10;
}

export interface RecommendationJob {
  id: string;
  title: string;
  companyName: string | null;
  location: string | null;
  workingType: string | null;
  experienceLevel: string | null;
  publishedAt: string;
}

interface JobRecommendationsBase {
  candidateCvId: string;
  parseResultId: string;
  cvSnapshotSha256: string;
  sourceCheckedAt: string;
  pool: { limit: 100; considered: number; truncated: boolean; order: 'PUBLISHED_AT_DESC_ID_ASC' };
  fitScore: null;
  candidateSupportVerified: false;
  applicationCreated: false;
  warnings: string[];
}

export interface KeywordJobRecommendationsResponse extends JobRecommendationsBase {
  schemaVersion: 'candidate-job-recommendations-v1';
  method: 'KEYWORD_OVERLAP_V1';
  scoreMeaning: 'DISTINCT_SHARED_TERMS_NOT_FIT_OR_SUPPORT';
  status: 'READY' | 'EMPTY';
  reason: null | 'NO_PUBLIC_JOBS' | 'NO_KEYWORD_OVERLAP' | 'CV_TEXT_EMPTY';
  items: {
    rank: number;
    keywordScore: number;
    matchedTerms: { term: string; cvSources: string[]; jobSources: string[] }[];
    job: RecommendationJob;
  }[];
}

export interface SemanticRecommendationEvidence {
  cvSource: string;
  cvText: string;
  jobText: string;
}

export interface SemanticJobRecommendationsResponse extends JobRecommendationsBase {
  schemaVersion: 'candidate-job-recommendations-v2';
  method: 'M1_REQUIREMENT_SEMANTIC_V1';
  scoreMeaning: 'RELATIVE_SEMANTIC_SIMILARITY';
  status: 'READY' | 'READY_PARTIAL' | 'EMPTY' | 'INDEX_WARMING';
  reason: null | 'NO_PUBLIC_JOBS' | 'CV_TEXT_EMPTY' | 'JD_INDEX_PENDING';
  modelVersion: string;
  pool: JobRecommendationsBase['pool'] & { indexed: number };
  items: {
    rank: number;
    semanticScore: number;
    evidence: SemanticRecommendationEvidence[];
    job: RecommendationJob;
  }[];
}

export type JobRecommendationsResponse =
  | KeywordJobRecommendationsResponse
  | SemanticJobRecommendationsResponse;
