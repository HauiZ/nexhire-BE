import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMatchingApplicationCvParseContext1786700000000 implements MigrationInterface {
  name = 'AddMatchingApplicationCvParseContext1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."cv_parse_context_enum" ADD VALUE IF NOT EXISTS 'MATCHING_APPLICATION'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL enum values cannot be safely removed without recreating the type.
  }
}
