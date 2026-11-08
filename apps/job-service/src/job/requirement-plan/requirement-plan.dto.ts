import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PlanComponentDto {
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/) id: string;
  @IsString() @MinLength(1) @MaxLength(5000) query: string;
  @IsString() @MinLength(1) @MaxLength(5000) source_quote: string;
  @IsIn(['core', 'supplementary', 'preferred', 'unknown']) importance:
    | 'core'
    | 'supplementary'
    | 'preferred'
    | 'unknown';
}

export class PlannedRequirementDto {
  @IsString() @MinLength(1) @MaxLength(120) requirement_id: string;
  @IsString() @MinLength(1) @MaxLength(50000) original_text: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PlanComponentDto)
  components: PlanComponentDto[];
  // Exact nested IDs, completeness and source order are validated in Python.
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8) all_of: string[][];
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean()
  joint_context_required: boolean;
}

export class SourceSelectionDto {
  @IsString() @MinLength(1) @MaxLength(120) source_id: string;
  @IsIn(['skills', 'requirements', 'description', 'benefits']) source_field:
    | 'skills'
    | 'requirements'
    | 'description'
    | 'benefits';
  @IsString() @MinLength(1) @MaxLength(50000) original_text: string;
  @IsIn(['heading', 'query', 'review']) suggested_role: 'heading' | 'query' | 'review';
  @Transform(({ obj, key }) => obj[key]) @IsBoolean() selected: boolean;
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PlanComponentDto)
  components: PlanComponentDto[];
}

export class CreatePlanDraftDto {
  @IsInt() @Min(0) expectedLatestRevision: number;
  @IsOptional()
  @IsIn(['jd-fixed-requirements-v1', 'jd-source-query-v2'])
  schemaVersion?: 'jd-fixed-requirements-v1' | 'jd-source-query-v2';
}
export class PlanBindingDto {
  @Matches(/^[a-f0-9]{64}$/) expectedContentSha256: string;
}
export class EditRequirementPlanDto extends PlanBindingDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => PlannedRequirementDto)
  requirements?: PlannedRequirementDto[];
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(256)
  @ValidateNested({ each: true })
  @Type(() => SourceSelectionDto)
  sources?: SourceSelectionDto[];
}

export interface PlanDocument {
  schema_version: 'jd-fixed-requirements-v1' | 'jd-source-query-v2';
  job_id: string;
  job_snapshot_sha256: string;
  revision: number;
  requirements?: PlannedRequirementDto[];
  sources?: SourceSelectionDto[];
  approval: null | {
    origin: 'authenticated_hr';
    reviewer_id: string;
    authorization_event_id: string;
    job_id: string;
    content_sha256: string;
    approved_at: string;
  };
}
export interface PlanInspection {
  query_budget?: {
    status: 'READY' | 'TOO_LONG' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
    limit: number;
    issues: { source_id: string; component_id: string; tokens: number; code: string }[];
  };
  status: 'UNPREPARED' | 'DRAFT' | 'STALE' | 'HR_CONFIRMED' | 'ASSISTANT_REVIEWED';
  current_job_snapshot_sha256: string;
  content_sha256: string | null;
  plan: PlanDocument | null;
  publishing_blocked: false;
  candidate_support_verified: false;
  matching_mode: string;
}
