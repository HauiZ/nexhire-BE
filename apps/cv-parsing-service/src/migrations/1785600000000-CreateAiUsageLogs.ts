import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiUsageLogs1785600000000 implements MigrationInterface {
  name = 'CreateAiUsageLogs1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `CREATE TABLE "ai_usage_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "parse_request_id" uuid NOT NULL, "candidate_id" uuid NOT NULL, "candidate_cv_id" uuid, "context" "public"."cv_parse_context_enum" NOT NULL, "provider" "public"."cv_parse_provider_enum" NOT NULL, "model" character varying(120) NOT NULL, "operation" character varying(80) NOT NULL DEFAULT 'CV_PARSE', "status" character varying(30) NOT NULL, "latency_ms" integer, "input_tokens" integer, "output_tokens" integer, "total_tokens" integer, "estimated_cost_usd" numeric(12,6), "error_code" character varying(120), "error_message" text, "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_ai_usage_logs_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ai_usage_logs_parse_request_id" ON "ai_usage_logs" ("parse_request_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ai_usage_logs_provider_model" ON "ai_usage_logs" ("provider", "model")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ai_usage_logs_created_at" ON "ai_usage_logs" ("created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "fk_ai_usage_logs_parse_request_id" FOREIGN KEY ("parse_request_id") REFERENCES "cv_parse_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_usage_logs" DROP CONSTRAINT "fk_ai_usage_logs_parse_request_id"`,
    );
    await queryRunner.query(`DROP INDEX "idx_ai_usage_logs_created_at"`);
    await queryRunner.query(`DROP INDEX "idx_ai_usage_logs_provider_model"`);
    await queryRunner.query(`DROP INDEX "idx_ai_usage_logs_parse_request_id"`);
    await queryRunner.query(`DROP TABLE "ai_usage_logs"`);
  }
}
