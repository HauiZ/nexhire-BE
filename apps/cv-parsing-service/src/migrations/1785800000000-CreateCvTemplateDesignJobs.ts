import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCvTemplateDesignJobs1785800000000 implements MigrationInterface {
  name = 'CreateCvTemplateDesignJobs1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    // Dùng lại hai enum type đã tồn tại trong DB này thay vì tạo type mới.
    await queryRunner.query(
      `CREATE TABLE "cv_template_design_jobs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_by_user_id" uuid NOT NULL, "document_id" uuid NOT NULL, "source_file_name" character varying(255) NOT NULL, "status" "public"."cv_parse_request_status_enum" NOT NULL DEFAULT 'QUEUED', "provider" "public"."cv_parse_provider_enum" NOT NULL DEFAULT 'OPENAI', "provider_version" character varying(80), "canvas" jsonb, "parsed_resume" jsonb, "raw_provider_payload" jsonb, "sanitize_report" jsonb, "error_code" character varying(120), "error_message" text, "started_at" TIMESTAMP WITH TIME ZONE, "finished_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_cv_template_design_jobs_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_cv_template_design_jobs_created_by" ON "cv_template_design_jobs" ("created_by_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_cv_template_design_jobs_status_created" ON "cv_template_design_jobs" ("status", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_cv_template_design_jobs_status_created"`);
    await queryRunner.query(`DROP INDEX "idx_cv_template_design_jobs_created_by"`);
    await queryRunner.query(`DROP TABLE "cv_template_design_jobs"`);
  }
}
