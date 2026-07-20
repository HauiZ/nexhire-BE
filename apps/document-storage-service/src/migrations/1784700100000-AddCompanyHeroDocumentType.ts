import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyHeroDocumentType1784700100000 implements MigrationInterface {
  name = 'AddCompanyHeroDocumentType1784700100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "document_type_enum" ADD VALUE IF NOT EXISTS 'COMPANY_HERO'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot safely remove enum values without recreating the type.
  }
}
