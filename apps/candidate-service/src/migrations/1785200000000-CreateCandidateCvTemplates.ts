import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCandidateCvTemplates1785200000000 implements MigrationInterface {
  name = 'CreateCandidateCvTemplates1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `CREATE TYPE "public"."candidate_cv_source_enum" AS ENUM('UPLOADED', 'TEMPLATE_EXPORT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."cv_template_key_enum" AS ENUM('modern', 'classic', 'minimal')`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidate_cvs" ADD "source" "public"."candidate_cv_source_enum" NOT NULL DEFAULT 'UPLOADED'`,
    );
    await queryRunner.query(`ALTER TABLE "candidate_cvs" ADD "source_template_id" uuid`);
    await queryRunner.query(`ALTER TABLE "candidate_cvs" ADD "source_cv_id" uuid`);
    await queryRunner.query(
      `CREATE TABLE "candidate_cv_templates" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "candidate_id" uuid NOT NULL, "name" character varying(255) NOT NULL, "template_key" "public"."cv_template_key_enum" NOT NULL, "source_document_id" uuid, "source_document_deleted_at" TIMESTAMP WITH TIME ZONE, "source_document_delete_error" text, "source_cv_id" uuid, "source_parse_request_id" uuid, "theme" jsonb NOT NULL DEFAULT '{}', "layout" jsonb NOT NULL DEFAULT '{}', "content_snapshot" jsonb NOT NULL DEFAULT '{}', "is_default" boolean NOT NULL DEFAULT false, "last_exported_cv_id" uuid, "last_exported_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "pk_candidate_cv_templates_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_candidate_cv_templates_candidate_id" ON "candidate_cv_templates" ("candidate_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_candidate_cv_templates_source_document_id" ON "candidate_cv_templates" ("source_document_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_candidate_cv_templates_candidate_default" ON "candidate_cv_templates" ("candidate_id") WHERE "is_default" = true AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidate_cv_templates" ADD CONSTRAINT "fk_candidate_cv_templates_candidate_id" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "candidate_cv_templates" DROP CONSTRAINT "fk_candidate_cv_templates_candidate_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."uq_candidate_cv_templates_candidate_default"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_candidate_cv_templates_source_document_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_candidate_cv_templates_candidate_id"`);
    await queryRunner.query(`DROP TABLE "candidate_cv_templates"`);
    await queryRunner.query(`ALTER TABLE "candidate_cvs" DROP COLUMN "source_cv_id"`);
    await queryRunner.query(`ALTER TABLE "candidate_cvs" DROP COLUMN "source_template_id"`);
    await queryRunner.query(`ALTER TABLE "candidate_cvs" DROP COLUMN "source"`);
    await queryRunner.query(`DROP TYPE "public"."cv_template_key_enum"`);
    await queryRunner.query(`DROP TYPE "public"."candidate_cv_source_enum"`);
  }
}
