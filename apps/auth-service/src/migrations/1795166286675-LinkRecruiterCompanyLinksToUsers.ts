import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkRecruiterCompanyLinksToUsers1795166286675 implements MigrationInterface {
  name = 'LinkRecruiterCompanyLinksToUsers1795166286675';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recruiter_company_links" ADD CONSTRAINT "fk_recruiter_company_links_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recruiter_company_links" DROP CONSTRAINT "fk_recruiter_company_links_user_id"`,
    );
  }
}
