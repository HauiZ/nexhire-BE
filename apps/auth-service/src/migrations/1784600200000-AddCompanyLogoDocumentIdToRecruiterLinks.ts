import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyLogoDocumentIdToRecruiterLinks1784600200000
  implements MigrationInterface
{
  name = 'AddCompanyLogoDocumentIdToRecruiterLinks1784600200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recruiter_company_links" ADD "company_logo_document_id" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recruiter_company_links" DROP COLUMN "company_logo_document_id"`,
    );
  }
}
