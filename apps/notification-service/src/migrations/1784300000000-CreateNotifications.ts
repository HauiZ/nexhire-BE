import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications1784300000000 implements MigrationInterface {
  name = 'CreateNotifications1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `CREATE TYPE "notification_recipient_type_enum" AS ENUM ('USER', 'COMPANY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "notification_sender_type_enum" AS ENUM ('SYSTEM', 'CANDIDATE', 'COMPANY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "notification_type_enum" AS ENUM ('APPLICATION_SUBMITTED', 'APPLICATION_STAGE_CHANGED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "recipient_type" "notification_recipient_type_enum" NOT NULL,
        "recipient_user_id" uuid,
        "recipient_company_id" uuid,
        "dedupe_key" character varying(255) NOT NULL,
        "sender_type" "notification_sender_type_enum" NOT NULL DEFAULT 'SYSTEM',
        "sender_entity_id" uuid,
        "sender_name" character varying(255),
        "sender_avatar_document_id" uuid,
        "sender_logo_url" text,
        "type" "notification_type_enum" NOT NULL,
        "title" character varying(255) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "chk_notifications_recipient_scope" CHECK (
          (
            "recipient_type" = 'USER'
            AND "recipient_user_id" IS NOT NULL
            AND "recipient_company_id" IS NULL
          )
          OR (
            "recipient_type" = 'COMPANY'
            AND "recipient_company_id" IS NOT NULL
            AND "recipient_user_id" IS NULL
          )
        )
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_notifications_dedupe_key" ON "notifications" ("dedupe_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_recipient_user_created_at" ON "notifications" ("recipient_user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_recipient_company_created_at" ON "notifications" ("recipient_company_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_read_at" ON "notifications" ("read_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_notifications_read_at"`);
    await queryRunner.query(`DROP INDEX "idx_notifications_recipient_company_created_at"`);
    await queryRunner.query(`DROP INDEX "idx_notifications_recipient_user_created_at"`);
    await queryRunner.query(`DROP INDEX "idx_notifications_dedupe_key"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TYPE "notification_type_enum"`);
    await queryRunner.query(`DROP TYPE "notification_sender_type_enum"`);
    await queryRunner.query(`DROP TYPE "notification_recipient_type_enum"`);
  }
}
