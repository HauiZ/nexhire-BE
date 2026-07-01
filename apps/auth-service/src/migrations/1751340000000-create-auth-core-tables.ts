import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthCoreTables1751340000000 implements MigrationInterface {
  name = 'CreateAuthCoreTables1751340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(255) NOT NULL,
        "phone" character varying(30),
        "full_name" character varying(255),
        "avatar_url" text,
        "status" character varying(30) NOT NULL DEFAULT 'ACTIVE',
        "email_verified" boolean NOT NULL DEFAULT false,
        "last_login_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_email" UNIQUE ("email")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "user_credentials" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "password_algorithm" character varying(50) NOT NULL DEFAULT 'bcrypt',
        "password_updated_at" TIMESTAMPTZ NOT NULL,
        "failed_login_attempts" integer NOT NULL DEFAULT 0,
        "locked_until" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_user_credentials_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_user_credentials_user_id" UNIQUE ("user_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(50) NOT NULL,
        "description" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_roles_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_roles_name" UNIQUE ("name")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_user_roles_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_user_roles_user_role" UNIQUE ("user_id", "role_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "email_verifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "email" character varying(255) NOT NULL,
        "token_hash" text NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "verified_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_email_verifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_email_verifications_token_hash" UNIQUE ("token_hash")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "user_credentials"
      ADD CONSTRAINT "fk_user_credentials_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "user_roles"
      ADD CONSTRAINT "fk_user_roles_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "user_roles"
      ADD CONSTRAINT "fk_user_roles_role_id"
      FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "email_verifications"
      ADD CONSTRAINT "fk_email_verifications_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "email_verifications" DROP CONSTRAINT "fk_email_verifications_user_id"`);
    await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT "fk_user_roles_role_id"`);
    await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT "fk_user_roles_user_id"`);
    await queryRunner.query(`ALTER TABLE "user_credentials" DROP CONSTRAINT "fk_user_credentials_user_id"`);
    await queryRunner.query(`DROP TABLE "email_verifications"`);
    await queryRunner.query(`DROP TABLE "user_roles"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "user_credentials"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
