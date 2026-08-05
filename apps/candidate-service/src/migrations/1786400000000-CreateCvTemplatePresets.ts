import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCvTemplatePresets1786400000000 implements MigrationInterface {
  name = 'CreateCvTemplatePresets1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `CREATE TYPE "cv_template_preset_status_enum" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "cv_template_preset_category_enum" AS ENUM ('it', 'marketing', 'sales', 'hr')`,
    );
    await queryRunner.query(`
      CREATE TABLE "cv_template_presets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "key" character varying(80) NOT NULL,
        "name_i18n" jsonb NOT NULL,
        "description_i18n" jsonb NOT NULL,
        "categories" "cv_template_preset_category_enum"[] NOT NULL DEFAULT '{}'::"cv_template_preset_category_enum"[],
        "accent" character varying(32),
        "thumbnail_url" character varying(1000),
        "canvas" jsonb NOT NULL,
        "status" "cv_template_preset_status_enum" NOT NULL DEFAULT 'DRAFT',
        "sort_order" integer NOT NULL DEFAULT 0,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_cv_template_presets_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_cv_template_presets_key" ON "cv_template_presets" ("key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_cv_template_presets_status_sort" ON "cv_template_presets" ("status", "sort_order")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_cv_template_presets_status_sort"`);
    await queryRunner.query(`DROP INDEX "uq_cv_template_presets_key"`);
    await queryRunner.query(`DROP TABLE "cv_template_presets"`);
    await queryRunner.query(`DROP TYPE "cv_template_preset_category_enum"`);
    await queryRunner.query(`DROP TYPE "cv_template_preset_status_enum"`);
  }
}
