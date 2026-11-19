import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { RequirementReviewDto, InterviewQuestionDto } from '../dto/review-workspace.dto';
import type { SupportLabel, SUPPORT_TARGET_VERSION } from '../dto/review-workspace.dto';

/** Stored metadata is server-owned and is deliberately absent from input DTOs. */
export interface StoredSupportJudgment {
  targetVersion: typeof SUPPORT_TARGET_VERSION;
  label: SupportLabel;
  evidenceIds: string[];
  rationale: string;
  uncertain: boolean;
  binding: {
    resultId: string;
    jobSnapshotSha256: string;
    candidateSnapshotSha256: string;
    planContentSha256: string | null;
    retrievalModelVersion: string;
    verifierModelVersion: string | null;
    assessmentSource: string | null;
    requirementTextSha256: string;
    evidenceTextSha256: string;
    sourceScope: 'RETRIEVED_EVIDENCE_ONLY';
    planStateScope: 'AT_MATCHING_TIME';
    currentPlanRevalidated: false;
    freshness: 'SNAPSHOT_AT_CHECK_TIME';
  };
  submission: {
    submittedBy: string;
    submittedAt: string;
    submittedRevision: number;
    contentSha256: string;
  };
  workflow: {
    state: 'SUBMITTED' | 'HOLD' | 'REVIEWED';
    holdReasons: string[];
    checkedAt: string;
    approvalResetReason?: 'WORKSPACE_REVISION_CHANGED';
    review?: {
      reviewedBy: string;
      reviewedAt: string;
      reviewedRevision: number;
      submittedRevision: number;
      submittedContentSha256: string;
      decision: 'APPROVE' | 'HOLD';
      reason: string;
    };
  };
}

export type StoredRequirementReview = RequirementReviewDto & {
  supportJudgment?: StoredSupportJudgment;
};

@Entity('application_reviews')
export class ApplicationReview {
  @PrimaryColumn({
    name: 'application_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_application_reviews',
  })
  applicationId: string;

  @PrimaryColumn({ type: 'integer', primaryKeyConstraintName: 'pk_application_reviews' })
  revision: number;

  @Column({ name: 'source_requirements', type: 'jsonb' })
  sourceRequirements: {
    requirementId: string;
    text: string;
    evidence: { evidenceId: string; text: string; source: string }[];
  }[];

  @Column({ name: 'result_id', type: 'uuid' })
  resultId: string;

  @Column({ name: 'job_snapshot_sha256', type: 'varchar', length: 64 })
  jobSnapshotSha256: string;

  @Column({ name: 'candidate_snapshot_sha256', type: 'varchar', length: 64 })
  candidateSnapshotSha256: string;

  @Column({ type: 'jsonb' })
  requirements: StoredRequirementReview[];

  @Column({ type: 'jsonb' })
  questions: InterviewQuestionDto[];

  @Column({
    name: 'interview_status',
    type: 'enum',
    enum: ['DRAFT', 'COMPLETED'],
    enumName: 'review_interview_status_enum',
  })
  interviewStatus: 'DRAFT' | 'COMPLETED';

  @Column({ name: 'reviewer_id', type: 'uuid' })
  reviewerId: string;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
