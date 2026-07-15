import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCvParseTables1784090000000 implements MigrationInterface {
  name = 'CreateCvParseTables1784090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `CREATE TYPE "public"."cv_parse_context_enum" AS ENUM('PROFILE_UPDATE', 'MATCHING_APPLICATION', 'MANUAL_REVIEW')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."cv_parse_request_status_enum" AS ENUM('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."cv_parse_provider_enum" AS ENUM('SKIMA', 'GEMINI')`,
    );
    await queryRunner.query(
      `CREATE TABLE "cv_parse_requests" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "candidate_id" uuid NOT NULL, "requested_by_user_id" uuid NOT NULL, "candidate_cv_id" uuid NOT NULL, "document_id" uuid NOT NULL, "document_url" text, "context" "public"."cv_parse_context_enum" NOT NULL DEFAULT 'PROFILE_UPDATE', "status" "public"."cv_parse_request_status_enum" NOT NULL DEFAULT 'QUEUED', "provider" "public"."cv_parse_provider_enum" NOT NULL DEFAULT 'SKIMA', "provider_version" character varying(80), "content_hash" character varying(128), "error_code" character varying(120), "error_message" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_cv_parse_requests_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_cv_parse_requests_candidate_id" ON "cv_parse_requests" ("candidate_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_cv_parse_requests_candidate_cv_id" ON "cv_parse_requests" ("candidate_cv_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_cv_parse_requests_document_id" ON "cv_parse_requests" ("document_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "cv_parse_results" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "parse_request_id" uuid NOT NULL, "candidate_id" uuid NOT NULL, "candidate_cv_id" uuid NOT NULL, "document_id" uuid NOT NULL, "provider" "public"."cv_parse_provider_enum" NOT NULL DEFAULT 'SKIMA', "provider_version" character varying(80), "normalized_payload" jsonb NOT NULL, "raw_provider_payload" jsonb, "confidence" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_cv_parse_results_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_cv_parse_results_parse_request_id" ON "cv_parse_results" ("parse_request_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_cv_parse_results_candidate_cv_id" ON "cv_parse_results" ("candidate_cv_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "cv_parse_results" ADD CONSTRAINT "fk_cv_parse_results_parse_request_id" FOREIGN KEY ("parse_request_id") REFERENCES "cv_parse_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cv_parse_results" DROP CONSTRAINT "fk_cv_parse_results_parse_request_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_cv_parse_results_candidate_cv_id"`);
    await queryRunner.query(`DROP INDEX "public"."uq_cv_parse_results_parse_request_id"`);
    await queryRunner.query(`DROP TABLE "cv_parse_results"`);
    await queryRunner.query(`DROP INDEX "public"."idx_cv_parse_requests_document_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_cv_parse_requests_candidate_cv_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_cv_parse_requests_candidate_id"`);
    await queryRunner.query(`DROP TABLE "cv_parse_requests"`);
    await queryRunner.query(`DROP TYPE "public"."cv_parse_provider_enum"`);
    await queryRunner.query(`DROP TYPE "public"."cv_parse_request_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."cv_parse_context_enum"`);
  }
}
