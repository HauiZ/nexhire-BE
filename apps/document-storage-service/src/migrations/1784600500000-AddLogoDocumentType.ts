import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLogoDocumentType1784600500000 implements MigrationInterface {
  name = 'AddLogoDocumentType1784600500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "document_type_enum" ADD VALUE IF NOT EXISTS 'LOGO'`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot safely remove enum values without recreating the type.
  }
}
