import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCompaniesTable1783786890301 implements MigrationInterface {
  name = 'CreateCompaniesTable1783786890301';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `CREATE TYPE "public"."companies_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "companies" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(255) NOT NULL, "logo" character varying, "description" text, "website" character varying, "address" character varying, "tax_code" character varying(50) NOT NULL, "owner_id" uuid NOT NULL, "status" "public"."companies_status_enum" NOT NULL DEFAULT 'PENDING', CONSTRAINT "pk_companies_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_company_tax_code" ON "companies" ("tax_code") `,
    );
    await queryRunner.query(`CREATE INDEX "idx_company_owner_id" ON "companies" ("owner_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_company_owner_id"`);
    await queryRunner.query(`DROP INDEX "public"."uq_company_tax_code"`);
    await queryRunner.query(`DROP TABLE "companies"`);
    await queryRunner.query(`DROP TYPE "public"."companies_status_enum"`);
  }
}
