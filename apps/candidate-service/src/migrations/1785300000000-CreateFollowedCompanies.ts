import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFollowedCompanies1785300000000 implements MigrationInterface {
  name = 'CreateFollowedCompanies1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE "followed_companies" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "candidate_id" uuid NOT NULL,
        "candidate_user_id" uuid NOT NULL,
        "company_id" uuid NOT NULL,
        "company_name" character varying(255) NOT NULL,
        "company_logo_url" text,
        "company_logo_document_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_followed_companies_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_followed_companies_candidate_company" ON "followed_companies" ("candidate_id", "company_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_followed_companies_candidate_created_at" ON "followed_companies" ("candidate_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_followed_companies_candidate_user_created_at" ON "followed_companies" ("candidate_user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_followed_companies_candidate_user_company" ON "followed_companies" ("candidate_user_id", "company_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_followed_companies_company_created_at" ON "followed_companies" ("company_id", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "followed_companies" ADD CONSTRAINT "fk_followed_companies_candidate_id" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "followed_companies" DROP CONSTRAINT "fk_followed_companies_candidate_id"`,
    );
    await queryRunner.query(`DROP INDEX "idx_followed_companies_company_created_at"`);
    await queryRunner.query(`DROP INDEX "idx_followed_companies_candidate_user_company"`);
    await queryRunner.query(`DROP INDEX "idx_followed_companies_candidate_user_created_at"`);
    await queryRunner.query(`DROP INDEX "idx_followed_companies_candidate_created_at"`);
    await queryRunner.query(`DROP INDEX "uq_followed_companies_candidate_company"`);
    await queryRunner.query(`DROP TABLE "followed_companies"`);
  }
}
