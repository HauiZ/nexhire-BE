import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApplications1784200000000 implements MigrationInterface {
  name = 'CreateApplications1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `CREATE TYPE "application_status_enum" AS ENUM ('SUBMITTED', 'OFFERED', 'REJECTED', 'WITHDRAWN', 'CANCELLED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "applications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "job_id" uuid NOT NULL,
        "job_title" character varying(255) NOT NULL,
        "company_id" uuid NOT NULL,
        "company_name" character varying(255),
        "company_logo_url" text,
        "candidate_id" uuid NOT NULL,
        "candidate_user_id" uuid NOT NULL,
        "candidate_full_name" character varying(255),
        "candidate_email" character varying(255),
        "candidate_phone" character varying(30),
        "candidate_avatar_document_id" uuid,
        "candidate_cv_id" uuid NOT NULL,
        "cv_document_id" uuid NOT NULL,
        "cv_title" character varying(255),
        "cv_file_name" character varying(255) NOT NULL,
        "cv_mime_type" character varying(150) NOT NULL,
        "cv_size" integer NOT NULL,
        "cv_parse_status" character varying(30) NOT NULL,
        "cover_letter" text,
        "status" "application_status_enum" NOT NULL DEFAULT 'SUBMITTED',
        "status_note" text,
        "submitted_at" timestamptz NOT NULL,
        "withdrawn_at" timestamptz,
        "decided_at" timestamptz,
        "cancelled_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_applications_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_applications_candidate_user_created_at" ON "applications" ("candidate_user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_applications_company_status_created_at" ON "applications" ("company_id", "status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_applications_job_status" ON "applications" ("job_id", "status")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_applications_active_candidate_job"
      ON "applications" ("candidate_user_id", "job_id")
      WHERE "status" IN ('SUBMITTED', 'OFFERED') AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_applications_active_candidate_job"`);
    await queryRunner.query(`DROP INDEX "idx_applications_job_status"`);
    await queryRunner.query(`DROP INDEX "idx_applications_company_status_created_at"`);
    await queryRunner.query(`DROP INDEX "idx_applications_candidate_user_created_at"`);
    await queryRunner.query(`DROP TABLE "applications"`);
    await queryRunner.query(`DROP TYPE "application_status_enum"`);
  }
}
