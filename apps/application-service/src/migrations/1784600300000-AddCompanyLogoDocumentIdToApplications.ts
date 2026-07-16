import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyLogoDocumentIdToApplications1784600300000
  implements MigrationInterface
{
  name = 'AddCompanyLogoDocumentIdToApplications1784600300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "applications" ADD "company_logo_document_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "applications" DROP COLUMN "company_logo_document_id"`);
  }
}
