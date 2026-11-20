import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkProgressEventsToApplications1795166280783 implements MigrationInterface {
  name = 'LinkProgressEventsToApplications1795166280783';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "application_progress_events" ADD CONSTRAINT "fk_application_progress_events_application_id" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "application_progress_events" DROP CONSTRAINT "fk_application_progress_events_application_id"`,
    );
  }
}
