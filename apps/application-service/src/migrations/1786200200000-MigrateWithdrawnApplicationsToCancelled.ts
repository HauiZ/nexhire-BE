import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateWithdrawnApplicationsToCancelled1786200200000 implements MigrationInterface {
  name = 'MigrateWithdrawnApplicationsToCancelled1786200200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH migrated AS (
        UPDATE "applications"
        SET
          "status" = 'CANCELLED',
          "cancelled_at" = COALESCE("cancelled_at", "withdrawn_at", "updated_at", now()),
          "status_note" = COALESCE("status_note", 'Migrated from withdrawn application'),
          "current_progress_step" = 'CANCELLED',
          "updated_at" = now()
        WHERE "status" = 'WITHDRAWN'
        RETURNING "id", "status_note", "cancelled_at", "withdrawn_at", "updated_at"
      )
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
        'CANCELLED',
        'Ho so ung tuyen da bi huy',
        'SYSTEM',
        "status_note",
        jsonb_build_object(
          'previousStatus', 'WITHDRAWN',
          'migration', '1786200200000-MigrateWithdrawnApplicationsToCancelled'
        ),
        COALESCE("cancelled_at", "withdrawn_at", "updated_at", now())
      FROM migrated
      ON CONFLICT ("application_id", "step") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH reverted AS (
        UPDATE "applications" application
        SET
          "status" = 'WITHDRAWN',
          "cancelled_at" = NULL,
          "current_progress_step" = 'CV_RECEIVED',
          "updated_at" = now()
        FROM "application_progress_events" event
        WHERE event."application_id" = application."id"
          AND event."step" = 'CANCELLED'
          AND event."metadata"->>'migration' = '1786200200000-MigrateWithdrawnApplicationsToCancelled'
        RETURNING application."id"
      )
      DELETE FROM "application_progress_events" event
      USING reverted
      WHERE event."application_id" = reverted."id"
        AND event."step" = 'CANCELLED'
        AND event."metadata"->>'migration' = '1786200200000-MigrateWithdrawnApplicationsToCancelled'
    `);
  }
}
