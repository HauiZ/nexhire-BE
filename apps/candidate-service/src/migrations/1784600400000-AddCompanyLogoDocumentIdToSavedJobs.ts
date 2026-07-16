import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyLogoDocumentIdToSavedJobs1784600400000 implements MigrationInterface {
  name = 'AddCompanyLogoDocumentIdToSavedJobs1784600400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "saved_jobs" ADD "company_logo_document_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "saved_jobs" DROP COLUMN "company_logo_document_id"`);
  }
}
