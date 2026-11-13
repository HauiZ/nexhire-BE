import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApplicationReviews1794441600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE review_interview_status_enum AS ENUM ('DRAFT', 'COMPLETED')`,
    );
    await queryRunner.query(`CREATE TABLE application_reviews (
      application_id uuid NOT NULL,
      revision integer NOT NULL CHECK (revision > 0),
      result_id uuid NOT NULL,
      job_snapshot_sha256 varchar(64) NOT NULL,
      candidate_snapshot_sha256 varchar(64) NOT NULL,
      source_requirements jsonb NOT NULL,
      requirements jsonb NOT NULL,
      questions jsonb NOT NULL,
      interview_status review_interview_status_enum NOT NULL,
      reviewer_id uuid NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT pk_application_reviews PRIMARY KEY (application_id, revision),
      CONSTRAINT fk_application_reviews_application FOREIGN KEY (application_id)
        REFERENCES applications(id) ON DELETE CASCADE
    )`);
    // Follow the existing domain table's owner, including admin-run migrations.
    await queryRunner.query(`DO $$ DECLARE service_owner text;
      BEGIN
        SELECT pg_get_userbyid(relowner) INTO service_owner
          FROM pg_class WHERE oid = 'public.applications'::regclass;
        EXECUTE format('GRANT SELECT, INSERT ON TABLE public.application_reviews TO %I', service_owner);
      END $$`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE application_reviews');
    await queryRunner.query('DROP TYPE review_interview_status_enum');
  }
}
