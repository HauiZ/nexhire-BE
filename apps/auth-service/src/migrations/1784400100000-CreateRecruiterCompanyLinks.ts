import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRecruiterCompanyLinks1784400100000 implements MigrationInterface {
  name = 'CreateRecruiterCompanyLinks1784400100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE "recruiter_company_links" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "company_id" uuid NOT NULL,
        "company_name" character varying(255),
        "company_status" character varying(30) NOT NULL,
        "last_synced_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_recruiter_company_links_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_recruiter_company_links_user_id" ON "recruiter_company_links" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_recruiter_company_links_company_id" ON "recruiter_company_links" ("company_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_recruiter_company_links_company_id"`);
    await queryRunner.query(`DROP INDEX "uq_recruiter_company_links_user_id"`);
    await queryRunner.query(`DROP TABLE "recruiter_company_links"`);
  }
}
