import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyLogoUrlToRecruiterCompanyLinks1784500000000
  implements MigrationInterface
{
  name = 'AddCompanyLogoUrlToRecruiterCompanyLinks1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "recruiter_company_links"
      ADD COLUMN "company_logo_url" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "recruiter_company_links"
      DROP COLUMN "company_logo_url"
    `);
  }
}
