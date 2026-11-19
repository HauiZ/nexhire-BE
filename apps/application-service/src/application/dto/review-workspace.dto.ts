import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsBoolean,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequirementReviewDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  requirementId: string;

  @ApiProperty({ enum: ['UNREVIEWED', 'REVIEWED', 'CLARIFY', 'NOT_FOUND'] })
  @IsIn(['UNREVIEWED', 'REVIEWED', 'CLARIFY', 'NOT_FOUND'])
  status: 'UNREVIEWED' | 'REVIEWED' | 'CLARIFY' | 'NOT_FOUND';

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  note: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  evidenceIds: string[];
}

export class InterviewQuestionDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  requirementId?: string | null;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  question: string;

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  answer: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  note: string;
}

export class SaveReviewWorkspaceDto {
  @ApiProperty({ description: '0 for first save, otherwise the last server revision' })
  @IsInt()
  @Min(0)
  expectedRevision: number;

  @ApiProperty()
  @IsUUID()
  resultId: string;

  @ApiProperty()
  @Matches(/^[a-f0-9]{64}$/)
  jobSnapshotSha256: string;

  @ApiProperty()
  @Matches(/^[a-f0-9]{64}$/)
  candidateSnapshotSha256: string;

  @ApiProperty({ type: [RequirementReviewDto] })
  @IsArray()
  @ArrayMaxSize(64)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => RequirementReviewDto)
  requirements: RequirementReviewDto[];

  @ApiProperty({ type: [InterviewQuestionDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => InterviewQuestionDto)
  questions: InterviewQuestionDto[];

  @ApiProperty({ enum: ['DRAFT', 'COMPLETED'] })
  @IsIn(['DRAFT', 'COMPLETED'])
  interviewStatus: 'DRAFT' | 'COMPLETED';
}

/** Explicit textual-evidence judgment; never inferred from workspace status or cosine. */
export const SUPPORT_TARGET_VERSION = 'requirement-textual-support-v1' as const;
export const SUPPORT_LABELS = [
  'SUPPORTED',
  'PARTIAL',
  'CONTRADICTED',
  'INSUFFICIENT_CONTEXT',
] as const;
export type SupportLabel = (typeof SUPPORT_LABELS)[number];

export class SupportJudgmentInputDto {
  @ApiProperty()
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  requirementId: string;

  @ApiProperty({ enum: SUPPORT_LABELS })
  @IsIn(SUPPORT_LABELS)
  label: SupportLabel;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @Matches(/\S/, { each: true })
  @MaxLength(200, { each: true })
  evidenceIds: string[];

  @ApiProperty()
  @IsString()
  @Matches(/\S/)
  @MaxLength(2000)
  rationale: string;

  @ApiProperty()
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean()
  uncertain: boolean;
}

export class SubmitSupportJudgmentsDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  expectedRevision: number;

  @ApiProperty()
  @IsUUID()
  resultId: string;

  @ApiProperty()
  @Matches(/^[a-f0-9]{64}$/)
  jobSnapshotSha256: string;

  @ApiProperty()
  @Matches(/^[a-f0-9]{64}$/)
  candidateSnapshotSha256: string;

  @ApiProperty({ enum: [SUPPORT_TARGET_VERSION] })
  @Equals(SUPPORT_TARGET_VERSION)
  targetVersion: typeof SUPPORT_TARGET_VERSION;

  @ApiProperty({ type: [SupportJudgmentInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => SupportJudgmentInputDto)
  judgments: SupportJudgmentInputDto[];
}

export class ReviewSupportJudgmentsDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  expectedRevision: number;

  @ApiProperty({ enum: ['APPROVE', 'HOLD'] })
  @IsIn(['APPROVE', 'HOLD'])
  decision: 'APPROVE' | 'HOLD';

  @ApiProperty()
  @IsString()
  @Matches(/\S/)
  @MaxLength(2000)
  reason: string;
}

export class SupportExportReadinessDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  expectedRevision: number;

  @ApiProperty({ enum: [true] })
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean()
  @Equals(true)
  optIn: true;
}
