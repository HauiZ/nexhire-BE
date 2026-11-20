import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkJobsAndRevisionsToCategories1795166342801 implements MigrationInterface {
  name = 'LinkJobsAndRevisionsToCategories1795166342801';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD CONSTRAINT "fk_jobs_category_id" FOREIGN KEY ("category_id") REFERENCES "job_categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_revisions" ADD CONSTRAINT "fk_job_revisions_category_id" FOREIGN KEY ("category_id") REFERENCES "job_categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_revisions" DROP CONSTRAINT "fk_job_revisions_category_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" DROP CONSTRAINT "fk_jobs_category_id"`,
    );
  }
}
