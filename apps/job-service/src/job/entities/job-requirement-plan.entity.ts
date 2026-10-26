import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { PlanDocument } from '../requirement-plan/requirement-plan.dto';

@Entity('job_requirement_plans')
@Index('uq_job_requirement_plan_revision', ['jobId', 'revision'], { unique: true })
export class JobRequirementPlan {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ name: 'job_id', type: 'uuid' }) jobId: string;
  @Column({ name: 'company_id', type: 'uuid' }) companyId: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ name: 'job_snapshot_sha256', type: 'varchar', length: 64 }) jobSnapshotSha256: string;
  @Column({ name: 'content_sha256', type: 'varchar', length: 64 }) contentSha256: string;
  @Column({ type: 'jsonb' }) document: PlanDocument;
  @Column({ name: 'created_by_user_id', type: 'uuid' }) createdByUserId: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

@Entity('job_requirement_plan_events')
@Index('idx_job_requirement_plan_events_job', ['jobId', 'createdAt'])
export class JobRequirementPlanEvent {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ name: 'job_id', type: 'uuid' }) jobId: string;
  @Column({ name: 'plan_id', type: 'uuid' }) planId: string;
  @Column({ name: 'actor_user_id', type: 'uuid' }) actorUserId: string;
  @Column({ type: 'varchar', length: 16 }) action: 'CREATED' | 'REVISED' | 'CONFIRMED';
  @Column({ name: 'content_sha256', type: 'varchar', length: 64 }) contentSha256: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
