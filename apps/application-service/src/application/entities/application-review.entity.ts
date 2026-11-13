import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { RequirementReviewDto, InterviewQuestionDto } from '../dto/review-workspace.dto';

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
  requirements: RequirementReviewDto[];

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
