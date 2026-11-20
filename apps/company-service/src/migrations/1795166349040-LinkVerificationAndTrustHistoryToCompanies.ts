import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkVerificationAndTrustHistoryToCompanies1795166349040 implements MigrationInterface {
  name = 'LinkVerificationAndTrustHistoryToCompanies1795166349040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company_verification_documents" ADD CONSTRAINT "fk_company_verification_documents_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_trust_histories" ADD CONSTRAINT "fk_company_trust_histories_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company_trust_histories" DROP CONSTRAINT "fk_company_trust_histories_company_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_verification_documents" DROP CONSTRAINT "fk_company_verification_documents_company_id"`,
    );
  }
}
