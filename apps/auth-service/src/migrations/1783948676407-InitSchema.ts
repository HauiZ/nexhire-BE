import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1783948676407 implements MigrationInterface {
    name = 'InitSchema1783948676407'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
        await queryRunner.query(`CREATE TABLE "email_verifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "email" character varying(255) NOT NULL, "token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "verified_at" TIMESTAMP WITH TIME ZONE, "last_sent_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resend_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_email_verifications_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_email_verifications_token_hash" ON "email_verifications" ("token_hash") `);
        await queryRunner.query(`CREATE TYPE "public"."password_algorithm_enum" AS ENUM('bcrypt')`);
        await queryRunner.query(`CREATE TABLE "user_credentials" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "password_hash" character varying(255) NOT NULL, "password_algorithm" "public"."password_algorithm_enum" NOT NULL DEFAULT 'bcrypt', "password_updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "failed_login_attempts" integer NOT NULL DEFAULT '0', "locked_until" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_dd0918407944553611bb3eb3ddc" UNIQUE ("user_id"), CONSTRAINT "REL_dd0918407944553611bb3eb3dd" UNIQUE ("user_id"), CONSTRAINT "pk_user_credentials_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."user_role_enum" AS ENUM('CANDIDATE', 'RECRUITER', 'ADMIN')`);
        await queryRunner.query(`CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" "public"."user_role_enum" NOT NULL, "description" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_roles_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_roles_name" ON "roles" ("name") `);
        await queryRunner.query(`CREATE TABLE "user_roles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "role_id" uuid NOT NULL, CONSTRAINT "uq_user_roles_user_role" UNIQUE ("user_id", "role_id"), CONSTRAINT "pk_user_roles_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."user_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'LOCKED')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying(255) NOT NULL, "phone" character varying(30), "full_name" character varying(255), "avatar_url" text, "status" "public"."user_status_enum" NOT NULL DEFAULT 'ACTIVE', "email_verified" boolean NOT NULL DEFAULT false, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_users_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "email" character varying(255) NOT NULL, "token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "last_sent_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resend_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_password_reset_tokens_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_password_reset_tokens_user_id_used_at_created_at" ON "password_reset_tokens" ("user_id", "used_at", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_password_reset_tokens_email_used_at_created_at" ON "password_reset_tokens" ("email", "used_at", "created_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_password_reset_tokens_token_hash" ON "password_reset_tokens" ("token_hash") `);
        await queryRunner.query(`ALTER TABLE "email_verifications" ADD CONSTRAINT "fk_email_verifications_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_credentials" ADD CONSTRAINT "fk_user_credentials_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_roles" ADD CONSTRAINT "fk_user_roles_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_roles" ADD CONSTRAINT "fk_user_roles_role_id" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "fk_password_reset_tokens_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "fk_password_reset_tokens_user_id"`);
        await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT "fk_user_roles_role_id"`);
        await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT "fk_user_roles_user_id"`);
        await queryRunner.query(`ALTER TABLE "user_credentials" DROP CONSTRAINT "fk_user_credentials_user_id"`);
        await queryRunner.query(`ALTER TABLE "email_verifications" DROP CONSTRAINT "fk_email_verifications_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."uq_password_reset_tokens_token_hash"`);
        await queryRunner.query(`DROP INDEX "public"."idx_password_reset_tokens_email_used_at_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_password_reset_tokens_user_id_used_at_created_at"`);
        await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."uq_users_email"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."user_status_enum"`);
        await queryRunner.query(`DROP TABLE "user_roles"`);
        await queryRunner.query(`DROP INDEX "public"."uq_roles_name"`);
        await queryRunner.query(`DROP TABLE "roles"`);
        await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
        await queryRunner.query(`DROP TABLE "user_credentials"`);
        await queryRunner.query(`DROP TYPE "public"."password_algorithm_enum"`);
        await queryRunner.query(`DROP INDEX "public"."uq_email_verifications_token_hash"`);
        await queryRunner.query(`DROP TABLE "email_verifications"`);
    }

}
