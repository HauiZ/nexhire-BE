import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyVerificationDashboardFields1784900000000 implements MigrationInterface {
  name = 'AddCompanyVerificationDashboardFields1784900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`ALTER TABLE "companies" ADD "status_reason" text`);
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "status_changed_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "companies" ADD "status_changed_by_user_id" uuid`);
    await queryRunner.query(
      `CREATE TYPE "company_verification_document_type_enum" AS ENUM ('BUSINESS_LICENSE', 'TAX_CERTIFICATE', 'DOMAIN_PROOF', 'OTHER')`,
    );
    await queryRunner.query(`
      CREATE TABLE "company_verification_documents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "document_id" uuid NOT NULL,
        "type" "company_verification_document_type_enum" NOT NULL,
        "uploaded_by_user_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_company_verification_documents_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_company_verification_documents_company_created_at" ON "company_verification_documents" ("company_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_company_verification_documents_company_document" ON "company_verification_documents" ("company_id", "document_id") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_company_verification_documents_company_document"`);
    await queryRunner.query(`DROP INDEX "idx_company_verification_documents_company_created_at"`);
    await queryRunner.query(`DROP TABLE "company_verification_documents"`);
    await queryRunner.query(`DROP TYPE "company_verification_document_type_enum"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "status_changed_by_user_id"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "status_changed_at"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "status_reason"`);
  }
}
