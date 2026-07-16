import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSavedJobs1784300000000 implements MigrationInterface {
  name = 'CreateSavedJobs1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `CREATE TYPE "saved_job_status_enum" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'NEEDS_REVIEW', 'SHOULD_REJECT', 'PUBLISHED', 'UNPUBLISHED', 'REJECTED', 'CLOSED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "saved_job_experience_level_enum" AS ENUM ('INTERN', 'FRESHER', 'JUNIOR', 'MIDDLE', 'SENIOR', 'LEAD')`,
    );
    await queryRunner.query(`
      CREATE TABLE "saved_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "candidate_id" uuid NOT NULL,
        "candidate_user_id" uuid NOT NULL,
        "job_id" uuid NOT NULL,
        "job_title" character varying(255) NOT NULL,
        "company_id" uuid NOT NULL,
        "company_name" character varying(255),
        "company_logo_url" text,
        "job_status" "saved_job_status_enum" NOT NULL,
        "experience_level" "saved_job_experience_level_enum" NOT NULL,
        "location" character varying(255) NOT NULL,
        "salary_min" integer,
        "salary_max" integer,
        "salary_currency" character varying(10) NOT NULL,
        "is_salary_visible" boolean NOT NULL,
        "deadline" timestamptz,
        "published_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_saved_jobs_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_saved_jobs_candidate_job" ON "saved_jobs" ("candidate_id", "job_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_saved_jobs_candidate_created_at" ON "saved_jobs" ("candidate_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_saved_jobs_candidate_user_created_at" ON "saved_jobs" ("candidate_user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_saved_jobs_candidate_user_job" ON "saved_jobs" ("candidate_user_id", "job_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_jobs" ADD CONSTRAINT "fk_saved_jobs_candidate_id" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "saved_jobs" DROP CONSTRAINT "fk_saved_jobs_candidate_id"`);
    await queryRunner.query(`DROP INDEX "idx_saved_jobs_candidate_user_job"`);
    await queryRunner.query(`DROP INDEX "idx_saved_jobs_candidate_user_created_at"`);
    await queryRunner.query(`DROP INDEX "idx_saved_jobs_candidate_created_at"`);
    await queryRunner.query(`DROP INDEX "uq_saved_jobs_candidate_job"`);
    await queryRunner.query(`DROP TABLE "saved_jobs"`);
    await queryRunner.query(`DROP TYPE "saved_job_experience_level_enum"`);
    await queryRunner.query(`DROP TYPE "saved_job_status_enum"`);
  }
}
