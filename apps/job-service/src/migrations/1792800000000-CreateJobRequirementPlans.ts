import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateJobRequirementPlans1792800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE job_requirement_plans (
      id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES jobs(id), company_id uuid NOT NULL,
      revision integer NOT NULL CHECK (revision > 0),
      job_snapshot_sha256 varchar(64) NOT NULL, content_sha256 varchar(64) NOT NULL,
      document jsonb NOT NULL, created_by_user_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_job_requirement_plan_revision UNIQUE (job_id, revision)
    )`);
    await queryRunner.query(`CREATE TABLE job_requirement_plan_events (
      id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES jobs(id),
      plan_id uuid NOT NULL REFERENCES job_requirement_plans(id), actor_user_id uuid NOT NULL,
      action varchar(16) NOT NULL CHECK (action IN ('CREATED', 'REVISED', 'CONFIRMED')),
      content_sha256 varchar(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      'CREATE INDEX idx_job_requirement_plan_events_job ON job_requirement_plan_events (job_id, created_at)',
    );
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE job_requirement_plan_events');
    await queryRunner.query('DROP TABLE job_requirement_plans');
  }
}
