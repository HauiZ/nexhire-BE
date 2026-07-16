import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyLogoDocumentId1784600000000 implements MigrationInterface {
  name = 'AddCompanyLogoDocumentId1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "companies" ADD "logo_document_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "logo_document_id"`);
  }
}
