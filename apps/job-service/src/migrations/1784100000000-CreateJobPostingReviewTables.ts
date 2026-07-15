import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateJobPostingReviewTables1784100000000 implements MigrationInterface {
  name = 'CreateJobPostingReviewTables1784100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TYPE "company_status_snapshot_enum" AS ENUM ('APPROVED', 'PENDING', 'REJECTED', 'SUSPENDED')
    `);
    await queryRunner.query(`
      CREATE TYPE "company_trust_level_enum" AS ENUM ('LOW', 'MEDIUM', 'HIGH')
    `);
    await queryRunner.query(`
      CREATE TYPE "job_status_enum" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'NEEDS_REVIEW', 'SHOULD_REJECT', 'PUBLISHED', 'REJECTED', 'CLOSED', 'EXPIRED')
    `);
    await queryRunner.query(`
      CREATE TYPE "job_revision_status_enum" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'NEEDS_REVIEW', 'SHOULD_REJECT', 'APPROVED', 'REJECTED', 'CANCELLED')
    `);
    await queryRunner.query(`
      CREATE TYPE "job_moderation_risk_level_enum" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    `);
    await queryRunner.query(`
      CREATE TYPE "job_moderation_decision_enum" AS ENUM ('PENDING_REVIEW', 'NEEDS_REVIEW', 'SHOULD_REJECT')
    `);
    await queryRunner.query(`
      CREATE TYPE "job_review_decision_enum" AS ENUM ('APPROVE', 'REJECT')
    `);
    await queryRunner.query(`
      CREATE TYPE "job_employment_type_enum" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE')
    `);
    await queryRunner.query(`
      CREATE TYPE "job_working_type_enum" AS ENUM ('ONSITE', 'REMOTE', 'HYBRID')
    `);
    await queryRunner.query(`
      CREATE TYPE "job_experience_level_enum" AS ENUM ('INTERN', 'FRESHER', 'JUNIOR', 'MIDDLE', 'SENIOR', 'LEAD')
    `);
    await queryRunner.query(`
      CREATE TYPE "job_moderation_target_type_enum" AS ENUM ('JOB', 'REVISION')
    `);

    await queryRunner.query(`
      CREATE TABLE "jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "company_name" character varying(255),
        "company_status" "company_status_snapshot_enum" NOT NULL,
        "company_trust_level" "company_trust_level_enum" NOT NULL DEFAULT 'MEDIUM',
        "company_snapshot_at" timestamptz NOT NULL,
        "created_by_user_id" uuid NOT NULL,
        "title" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "requirements" text NOT NULL,
        "benefits" text,
        "category_id" uuid,
        "employment_type" "job_employment_type_enum" NOT NULL,
        "working_type" "job_working_type_enum" NOT NULL,
        "experience_level" "job_experience_level_enum" NOT NULL,
        "location" character varying(255) NOT NULL,
        "salary_min" integer,
        "salary_max" integer,
        "salary_currency" character varying(3) NOT NULL DEFAULT 'VND',
        "is_salary_visible" boolean NOT NULL DEFAULT true,
        "deadline" timestamptz,
        "number_of_openings" integer,
        "status" "job_status_enum" NOT NULL DEFAULT 'DRAFT',
        "version" integer NOT NULL DEFAULT 1,
        "application_count" integer NOT NULL DEFAULT 0,
        "published_at" timestamptz,
        "closed_at" timestamptz,
        "expires_at" timestamptz,
        "risk_score" integer,
        "risk_level" "job_moderation_risk_level_enum",
        "moderation_decision" "job_moderation_decision_enum",
        "moderation_reasons" text[] NOT NULL DEFAULT '{}',
        "moderation_matched_rules" text[] NOT NULL DEFAULT '{}',
        "reviewed_by_user_id" uuid,
        "reviewed_at" timestamptz,
        "review_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_jobs_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_jobs_public_status_created_at" ON "jobs" ("status", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_jobs_company_status" ON "jobs" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_jobs_category_id" ON "jobs" ("category_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "job_revisions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "job_id" uuid NOT NULL,
        "company_id" uuid NOT NULL,
        "created_by_user_id" uuid NOT NULL,
        "status" "job_revision_status_enum" NOT NULL DEFAULT 'DRAFT',
        "title" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "requirements" text NOT NULL,
        "benefits" text,
        "category_id" uuid,
        "employment_type" "job_employment_type_enum" NOT NULL,
        "working_type" "job_working_type_enum" NOT NULL,
        "experience_level" "job_experience_level_enum" NOT NULL,
        "location" character varying(255) NOT NULL,
        "salary_min" integer,
        "salary_max" integer,
        "salary_currency" character varying(3) NOT NULL DEFAULT 'VND',
        "is_salary_visible" boolean NOT NULL DEFAULT true,
        "deadline" timestamptz,
        "number_of_openings" integer,
        "change_summary" text,
        "risk_score" integer,
        "risk_level" "job_moderation_risk_level_enum",
        "moderation_decision" "job_moderation_decision_enum",
        "moderation_reasons" text[] NOT NULL DEFAULT '{}',
        "moderation_matched_rules" text[] NOT NULL DEFAULT '{}',
        "reviewed_by_user_id" uuid,
        "reviewed_at" timestamptz,
        "review_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_job_revisions_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_job_revisions_job_id" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_job_revisions_job_status" ON "job_revisions" ("job_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "job_moderation_reviews" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "job_id" uuid NOT NULL,
        "target_type" "job_moderation_target_type_enum" NOT NULL,
        "target_id" uuid NOT NULL,
        "risk_score" integer NOT NULL,
        "risk_level" "job_moderation_risk_level_enum" NOT NULL,
        "decision" "job_moderation_decision_enum" NOT NULL,
        "reasons" text[] NOT NULL,
        "matched_rules" text[] NOT NULL,
        "reviewed_by_user_id" uuid,
        "reviewed_at" timestamptz,
        "admin_decision" "job_review_decision_enum",
        "admin_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_job_moderation_reviews_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_job_moderation_reviews_job_created_at" ON "job_moderation_reviews" ("job_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_job_moderation_reviews_target" ON "job_moderation_reviews" ("target_type", "target_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_job_moderation_reviews_target"`);
    await queryRunner.query(`DROP INDEX "idx_job_moderation_reviews_job_created_at"`);
    await queryRunner.query(`DROP TABLE "job_moderation_reviews"`);
    await queryRunner.query(`DROP INDEX "idx_job_revisions_job_status"`);
    await queryRunner.query(`DROP TABLE "job_revisions"`);
    await queryRunner.query(`DROP INDEX "idx_jobs_category_id"`);
    await queryRunner.query(`DROP INDEX "idx_jobs_company_status"`);
    await queryRunner.query(`DROP INDEX "idx_jobs_public_status_created_at"`);
    await queryRunner.query(`DROP TABLE "jobs"`);
    await queryRunner.query(`DROP TYPE "job_moderation_target_type_enum"`);
    await queryRunner.query(`DROP TYPE "job_experience_level_enum"`);
    await queryRunner.query(`DROP TYPE "job_working_type_enum"`);
    await queryRunner.query(`DROP TYPE "job_employment_type_enum"`);
    await queryRunner.query(`DROP TYPE "job_review_decision_enum"`);
    await queryRunner.query(`DROP TYPE "job_moderation_decision_enum"`);
    await queryRunner.query(`DROP TYPE "job_moderation_risk_level_enum"`);
    await queryRunner.query(`DROP TYPE "job_revision_status_enum"`);
    await queryRunner.query(`DROP TYPE "job_status_enum"`);
    await queryRunner.query(`DROP TYPE "company_trust_level_enum"`);
    await queryRunner.query(`DROP TYPE "company_status_snapshot_enum"`);
  }
}
