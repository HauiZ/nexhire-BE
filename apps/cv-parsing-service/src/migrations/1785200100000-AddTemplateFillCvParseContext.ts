import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTemplateFillCvParseContext1785200100000 implements MigrationInterface {
  name = 'AddTemplateFillCvParseContext1785200100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."cv_parse_context_enum" ADD VALUE IF NOT EXISTS 'TEMPLATE_FILL'`);
    await queryRunner.query(`ALTER TABLE "cv_parse_requests" ALTER COLUMN "candidate_cv_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "cv_parse_results" ALTER COLUMN "candidate_cv_id" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "cv_parse_results" WHERE "candidate_cv_id" IS NULL`);
    await queryRunner.query(`DELETE FROM "cv_parse_requests" WHERE "candidate_cv_id" IS NULL`);
    await queryRunner.query(`ALTER TABLE "cv_parse_results" ALTER COLUMN "candidate_cv_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "cv_parse_requests" ALTER COLUMN "candidate_cv_id" SET NOT NULL`);
  }
}
