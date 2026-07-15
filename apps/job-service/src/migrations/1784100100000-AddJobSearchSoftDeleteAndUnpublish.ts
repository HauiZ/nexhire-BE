import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobSearchSoftDeleteAndUnpublish1784100100000 implements MigrationInterface {
  name = 'AddJobSearchSoftDeleteAndUnpublish1784100100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "job_status_enum" ADD VALUE IF NOT EXISTS 'UNPUBLISHED'`);

    await queryRunner.query(`ALTER TABLE "jobs" ADD "skills" text[] NOT NULL DEFAULT '{}'`);
    await queryRunner.query(
      `ALTER TABLE "job_revisions" ADD "skills" text[] NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(`ALTER TABLE "jobs" ADD "unpublished_by_user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "jobs" ADD "unpublished_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "jobs" ADD "unpublish_reason" text`);
    await queryRunner.query(`ALTER TABLE "jobs" ADD "company_logo_url" text`);
    await queryRunner.query(`ALTER TABLE "jobs" ADD "search_title" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "jobs" ADD "search_description" text NOT NULL DEFAULT ''`);
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD "search_requirements" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(`ALTER TABLE "jobs" ADD "search_skills" text NOT NULL DEFAULT ''`);
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD "search_company_name" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(`ALTER TABLE "jobs" ADD "search_location" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "jobs" ADD "search_text" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "jobs" ADD "deleted_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "job_revisions" ADD "deleted_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "job_moderation_reviews" ADD "deleted_at" timestamptz`);
    await queryRunner.query(`
      UPDATE "jobs"
      SET
        "search_title" = lower(regexp_replace(coalesce("title", ''), '<[^>]*>', ' ', 'g')),
        "search_description" = lower(regexp_replace(coalesce("description", ''), '<[^>]*>', ' ', 'g')),
        "search_requirements" = lower(regexp_replace(coalesce("requirements", ''), '<[^>]*>', ' ', 'g')),
        "search_skills" = lower(array_to_string(coalesce("skills", '{}'), ' ')),
        "search_company_name" = lower(coalesce("company_name", '')),
        "search_location" = lower(coalesce("location", '')),
        "search_text" = lower(
          regexp_replace(coalesce("title", ''), '<[^>]*>', ' ', 'g') || ' ' ||
          regexp_replace(coalesce("description", ''), '<[^>]*>', ' ', 'g') || ' ' ||
          regexp_replace(coalesce("requirements", ''), '<[^>]*>', ' ', 'g') || ' ' ||
          array_to_string(coalesce("skills", '{}'), ' ') || ' ' ||
          coalesce("company_name", '') || ' ' ||
          coalesce("location", '')
        )
    `);
    await queryRunner.query(`
      CREATE TABLE "job_processed_application_events" (
        "application_id" uuid NOT NULL,
        "job_id" uuid NOT NULL,
        "candidate_id" uuid NOT NULL,
        "processed_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_job_processed_application_events_application_id" PRIMARY KEY ("application_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD "search_vector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce("search_title", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce("search_skills", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce("search_company_name", '')), 'B') ||
        setweight(to_tsvector('simple', coalesce("search_requirements", '')), 'B') ||
        setweight(to_tsvector('simple', coalesce("search_location", '')), 'C') ||
        setweight(to_tsvector('simple', coalesce("search_description", '')), 'D')
      ) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_jobs_search_vector" ON "jobs" USING GIN ("search_vector")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_jobs_deleted_at" ON "jobs" ("deleted_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_jobs_deleted_at"`);
    await queryRunner.query(`DROP INDEX "idx_jobs_search_vector"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "search_vector"`);
    await queryRunner.query(`DROP TABLE "job_processed_application_events"`);
    await queryRunner.query(`ALTER TABLE "job_moderation_reviews" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "job_revisions" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "search_text"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "search_location"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "search_company_name"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "search_skills"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "search_requirements"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "search_description"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "search_title"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "company_logo_url"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "unpublish_reason"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "unpublished_at"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "unpublished_by_user_id"`);
    await queryRunner.query(`ALTER TABLE "job_revisions" DROP COLUMN "skills"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "skills"`);
  }
}
