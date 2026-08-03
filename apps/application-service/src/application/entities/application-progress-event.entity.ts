import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { ApplicationProgressStep } from '@nexhire/shared';

export enum ApplicationProgressActorType {
  CANDIDATE = 'CANDIDATE',
  RECRUITER = 'RECRUITER',
  SYSTEM = 'SYSTEM',
}

@Entity('application_progress_events')
@Index('idx_application_progress_events_application_occurred', ['applicationId', 'occurredAt'])
@Index('uq_application_progress_events_application_step', ['applicationId', 'step'], {
  unique: true,
})
export class ApplicationProgressEvent {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    default: () => 'gen_random_uuid()',
    primaryKeyConstraintName: 'pk_application_progress_events_id',
  })
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @Column({ name: 'step', type: 'varchar', length: 40 })
  step: ApplicationProgressStep;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'actor_type', type: 'varchar', length: 30 })
  actorType: ApplicationProgressActorType;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ name: 'note', type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
