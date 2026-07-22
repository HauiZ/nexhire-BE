import { MigrationInterface, QueryRunner } from 'typeorm';

export class DefaultCvParseProviderGemini1785100000000 implements MigrationInterface {
  name = 'DefaultCvParseProviderGemini1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cv_parse_requests" ALTER COLUMN "provider" SET DEFAULT 'GEMINI'`,
    );
    await queryRunner.query(
      `ALTER TABLE "cv_parse_results" ALTER COLUMN "provider" SET DEFAULT 'GEMINI'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cv_parse_results" ALTER COLUMN "provider" SET DEFAULT 'SKIMA'`,
    );
    await queryRunner.query(
      `ALTER TABLE "cv_parse_requests" ALTER COLUMN "provider" SET DEFAULT 'SKIMA'`,
    );
  }
}
