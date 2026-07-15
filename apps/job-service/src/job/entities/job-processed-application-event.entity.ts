import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('job_processed_application_events')
export class JobProcessedApplicationEvent {
  @PrimaryColumn({
    name: 'application_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_job_processed_application_events_application_id',
  })
  applicationId: string;

  @Column({ name: 'job_id', type: 'uuid' })
  jobId: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @CreateDateColumn({ name: 'processed_at', type: 'timestamptz' })
  processedAt: Date;
}
