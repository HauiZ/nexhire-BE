import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCandidateProfileFoundation1783770000000 implements MigrationInterface {
  name = 'CreateCandidateProfileFoundation1783770000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`
      CREATE TYPE "candidate_profile_visibility_enum" AS ENUM ('PUBLIC', 'PRIVATE')
    `);
    await queryRunner.query(`
      CREATE TYPE "candidate_data_source_enum" AS ENUM ('MANUAL', 'CV_PARSE', 'IMPORT')
    `);
    await queryRunner.query(`
      CREATE TYPE "candidate_skill_level_enum" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT')
    `);
    await queryRunner.query(`
      CREATE TYPE "candidate_employment_type_enum" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE')
    `);
    await queryRunner.query(`
      CREATE TABLE "candidate_profiles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "full_name" character varying(255),
        "phone" character varying(30),
        "contact_email" character varying(255),
        "avatar_document_id" uuid,
        "headline" character varying(255),
        "summary" text,
        "location" character varying(255),
        "portfolio_url" text,
        "linkedin_url" text,
        "open_to_work" boolean NOT NULL DEFAULT true,
        "visibility" "candidate_profile_visibility_enum" NOT NULL DEFAULT 'PUBLIC',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_candidate_profiles_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_candidate_profiles_user_id"
      ON "candidate_profiles" ("user_id")
    `);
    await queryRunner.query(`
      CREATE TABLE "candidate_skills" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "candidate_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "normalized_name" character varying(120) NOT NULL,
        "level" "candidate_skill_level_enum",
        "years_of_experience" double precision,
        "source" "candidate_data_source_enum" NOT NULL DEFAULT 'MANUAL',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_candidate_skills_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_candidate_skills_candidate_normalized_name"
      ON "candidate_skills" ("candidate_id", "normalized_name")
    `);
    await queryRunner.query(`
      CREATE TABLE "candidate_educations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "candidate_id" uuid NOT NULL,
        "school_name" character varying(255) NOT NULL,
        "degree" character varying(255),
        "field_of_study" character varying(255),
        "start_year" integer,
        "end_year" integer,
        "is_current" boolean NOT NULL DEFAULT false,
        "description" text,
        "source" "candidate_data_source_enum" NOT NULL DEFAULT 'MANUAL',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_candidate_educations_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_candidate_educations_candidate_id"
      ON "candidate_educations" ("candidate_id")
    `);
    await queryRunner.query(`
      CREATE TABLE "candidate_experiences" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "candidate_id" uuid NOT NULL,
        "company_name" character varying(255) NOT NULL,
        "position" character varying(255) NOT NULL,
        "employment_type" "candidate_employment_type_enum",
        "start_month" integer,
        "start_year" integer,
        "end_month" integer,
        "end_year" integer,
        "is_current" boolean NOT NULL DEFAULT false,
        "description" text,
        "source" "candidate_data_source_enum" NOT NULL DEFAULT 'MANUAL',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_candidate_experiences_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_candidate_experiences_candidate_id"
      ON "candidate_experiences" ("candidate_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "candidate_skills"
      ADD CONSTRAINT "fk_candidate_skills_candidate_id"
      FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "candidate_educations"
      ADD CONSTRAINT "fk_candidate_educations_candidate_id"
      FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "candidate_experiences"
      ADD CONSTRAINT "fk_candidate_experiences_candidate_id"
      FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "candidate_experiences" DROP CONSTRAINT "fk_candidate_experiences_candidate_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidate_educations" DROP CONSTRAINT "fk_candidate_educations_candidate_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidate_skills" DROP CONSTRAINT "fk_candidate_skills_candidate_id"`,
    );
    await queryRunner.query(`DROP INDEX "idx_candidate_experiences_candidate_id"`);
    await queryRunner.query(`DROP TABLE "candidate_experiences"`);
    await queryRunner.query(`DROP INDEX "idx_candidate_educations_candidate_id"`);
    await queryRunner.query(`DROP TABLE "candidate_educations"`);
    await queryRunner.query(`DROP INDEX "uq_candidate_skills_candidate_normalized_name"`);
    await queryRunner.query(`DROP TABLE "candidate_skills"`);
    await queryRunner.query(`DROP INDEX "uq_candidate_profiles_user_id"`);
    await queryRunner.query(`DROP TABLE "candidate_profiles"`);
    await queryRunner.query(`DROP TYPE "candidate_employment_type_enum"`);
    await queryRunner.query(`DROP TYPE "candidate_skill_level_enum"`);
    await queryRunner.query(`DROP TYPE "candidate_data_source_enum"`);
    await queryRunner.query(`DROP TYPE "candidate_profile_visibility_enum"`);
  }
}
