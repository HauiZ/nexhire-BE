import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyLogoDocumentIdToJobs1784600100000 implements MigrationInterface {
  name = 'AddCompanyLogoDocumentIdToJobs1784600100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jobs" ADD "company_logo_document_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "company_logo_document_id"`);
  }
}
