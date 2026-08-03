import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApplicationProgressEvents1786100000000 implements MigrationInterface {
  name = 'AddApplicationProgressEvents1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `ALTER TABLE "applications" ADD "current_progress_step" character varying(40)`,
    );
    await queryRunner.query(`ALTER TABLE "applications" ADD "first_cv_received_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "applications" ADD "first_cv_viewed_at" timestamptz`);
    await queryRunner.query(`
      CREATE TABLE "application_progress_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "application_id" uuid NOT NULL,
        "step" character varying(40) NOT NULL,
        "title" character varying(255) NOT NULL,
        "description" text,
        "actor_type" character varying(30) NOT NULL,
        "actor_user_id" uuid,
        "note" text,
        "metadata" jsonb,
        "occurred_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_application_progress_events_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_application_progress_events_application_step" ON "application_progress_events" ("application_id", "step")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_application_progress_events_application_occurred" ON "application_progress_events" ("application_id", "occurred_at")`,
    );
    await queryRunner.query(`
      INSERT INTO "application_progress_events" (
        "application_id",
        "step",
        "title",
        "actor_type",
        "actor_user_id",
        "occurred_at"
      )
      SELECT
        "id",
        'CV_SUBMITTED',
        'Ứng viên gửi hồ sơ thành công',
        'CANDIDATE',
        "candidate_user_id",
        COALESCE("submitted_at", "created_at", now())
      FROM "applications"
    `);
    await queryRunner.query(`
      INSERT INTO "application_progress_events" (
        "application_id",
        "step",
        "title",
        "actor_type",
        "occurred_at"
      )
      SELECT
        "id",
        'CV_RECEIVED',
        'NTD đã tiếp nhận hồ sơ',
        'SYSTEM',
        COALESCE("submitted_at", "created_at", now())
      FROM "applications"
    `);
    await queryRunner.query(`
      INSERT INTO "application_progress_events" (
        "application_id",
        "step",
        "title",
        "actor_type",
        "note",
        "metadata",
        "occurred_at"
      )
      SELECT
        "id",
        'RESPONDED',
        'NTD đã phản hồi hồ sơ',
        'RECRUITER',
        "status_note",
        jsonb_build_object('status', "status"),
        COALESCE("decided_at", "updated_at", now())
      FROM "applications"
      WHERE "status" IN ('OFFERED', 'REJECTED')
    `);
    await queryRunner.query(`
      INSERT INTO "application_progress_events" (
        "application_id",
        "step",
        "title",
        "actor_type",
        "note",
        "occurred_at"
      )
      SELECT
        "id",
        'CANCELLED',
        'Hồ sơ ứng tuyển đã bị hủy',
        'SYSTEM',
        "status_note",
        COALESCE("cancelled_at", "updated_at", now())
      FROM "applications"
      WHERE "status" = 'CANCELLED'
    `);
    await queryRunner.query(`
      UPDATE "applications"
      SET
        "current_progress_step" = CASE
          WHEN "status" = 'CANCELLED' THEN 'CANCELLED'
          WHEN "status" IN ('OFFERED', 'REJECTED') THEN 'RESPONDED'
          ELSE 'CV_RECEIVED'
        END,
        "first_cv_received_at" = COALESCE("submitted_at", "created_at", now())
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_application_progress_events_application_occurred"`);
    await queryRunner.query(`DROP INDEX "uq_application_progress_events_application_step"`);
    await queryRunner.query(`DROP TABLE "application_progress_events"`);
    await queryRunner.query(`ALTER TABLE "applications" DROP COLUMN "first_cv_viewed_at"`);
    await queryRunner.query(`ALTER TABLE "applications" DROP COLUMN "first_cv_received_at"`);
    await queryRunner.query(`ALTER TABLE "applications" DROP COLUMN "current_progress_step"`);
  }
}
