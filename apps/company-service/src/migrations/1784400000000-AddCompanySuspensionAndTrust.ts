import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanySuspensionAndTrust1784400000000 implements MigrationInterface {
  name = 'AddCompanySuspensionAndTrust1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `ALTER TYPE "companies_status_enum" ADD VALUE IF NOT EXISTS 'SUSPENDED'`,
    );
    await queryRunner.query(
      `CREATE TYPE "company_trust_level_enum" AS ENUM ('LOW', 'MEDIUM', 'HIGH')`,
    );
    await queryRunner.query(
      `CREATE TYPE "company_trust_change_direction_enum" AS ENUM ('INCREASE', 'DECREASE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "company_trust_change_source_enum" AS ENUM ('MANUAL', 'AUTO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "trust_level" "company_trust_level_enum" NOT NULL DEFAULT 'MEDIUM'`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "approved_low_risk_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "negative_trust_signal_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`
      CREATE TABLE "company_trust_histories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "previous_trust_level" "company_trust_level_enum" NOT NULL,
        "new_trust_level" "company_trust_level_enum" NOT NULL,
        "direction" "company_trust_change_direction_enum" NOT NULL,
        "source" "company_trust_change_source_enum" NOT NULL,
        "changed_by_user_id" uuid,
        "reason" text NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_company_trust_histories_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_company_trust_histories_company_created_at" ON "company_trust_histories" ("company_id", "created_at")`,
    );
    await queryRunner.query(`
      CREATE TABLE "company_processed_trust_signals" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "target_type" character varying(20) NOT NULL,
        "target_id" uuid NOT NULL,
        "processed_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_company_processed_trust_signals_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_company_processed_trust_signals_target" UNIQUE ("target_type", "target_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_company_processed_trust_signals_company" ON "company_processed_trust_signals" ("company_id", "processed_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_company_processed_trust_signals_company"`);
    await queryRunner.query(`DROP TABLE "company_processed_trust_signals"`);
    await queryRunner.query(`DROP INDEX "idx_company_trust_histories_company_created_at"`);
    await queryRunner.query(`DROP TABLE "company_trust_histories"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "negative_trust_signal_count"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "approved_low_risk_count"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "trust_level"`);
    await queryRunner.query(`DROP TYPE "company_trust_change_source_enum"`);
    await queryRunner.query(`DROP TYPE "company_trust_change_direction_enum"`);
    await queryRunner.query(`DROP TYPE "company_trust_level_enum"`);
  }
}
