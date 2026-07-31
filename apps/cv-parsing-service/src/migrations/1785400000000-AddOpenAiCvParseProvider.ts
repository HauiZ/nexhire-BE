import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOpenAiCvParseProvider1785400000000 implements MigrationInterface {
  name = 'AddOpenAiCvParseProvider1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."cv_parse_provider_enum" ADD VALUE IF NOT EXISTS 'OPENAI'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL enum values cannot be dropped safely without recreating the type.
  }
}
