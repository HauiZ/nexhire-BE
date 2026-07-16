import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublishedJobDeadlineIndex1784300100000 implements MigrationInterface {
  name = 'AddPublishedJobDeadlineIndex1784300100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_jobs_published_deadline"
      ON "jobs" ("deadline")
      WHERE "status" = 'PUBLISHED'
        AND "deleted_at" IS NULL
        AND "deadline" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_jobs_published_deadline"`);
  }
}
