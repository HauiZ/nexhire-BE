import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthIdentities1784800000000 implements MigrationInterface {
  name = 'CreateAuthIdentities1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE TYPE "public"."auth_identity_provider_enum" AS ENUM('GOOGLE')`);
    await queryRunner.query(
      `CREATE TABLE "auth_identities" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "provider" "public"."auth_identity_provider_enum" NOT NULL, "provider_user_id" character varying(255) NOT NULL, "email" character varying(255) NOT NULL, "email_verified" boolean NOT NULL DEFAULT true, "full_name" character varying(255), "avatar_url" text, "linked_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_auth_identities_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_auth_identities_provider_user" ON "auth_identities" ("provider", "provider_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_auth_identities_user_provider" ON "auth_identities" ("user_id", "provider")`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_identities" ADD CONSTRAINT "fk_auth_identities_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auth_identities" DROP CONSTRAINT "fk_auth_identities_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_auth_identities_user_provider"`);
    await queryRunner.query(`DROP INDEX "public"."uq_auth_identities_provider_user"`);
    await queryRunner.query(`DROP TABLE "auth_identities"`);
    await queryRunner.query(`DROP TYPE "public"."auth_identity_provider_enum"`);
  }
}
