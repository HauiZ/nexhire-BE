import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePasswordResetTokens1782924195922 implements MigrationInterface {
    name = 'CreatePasswordResetTokens1782924195922'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "email" character varying(255) NOT NULL, "token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "last_sent_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resend_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_password_reset_tokens_user_id_used_at_created_at" ON "password_reset_tokens" ("user_id", "used_at", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_password_reset_tokens_email_used_at_created_at" ON "password_reset_tokens" ("email", "used_at", "created_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_password_reset_tokens_token_hash" ON "password_reset_tokens" ("token_hash") `);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "fk_password_reset_tokens_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "fk_password_reset_tokens_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."uq_password_reset_tokens_token_hash"`);
        await queryRunner.query(`DROP INDEX "public"."idx_password_reset_tokens_email_used_at_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_password_reset_tokens_user_id_used_at_created_at"`);
        await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    }

}
