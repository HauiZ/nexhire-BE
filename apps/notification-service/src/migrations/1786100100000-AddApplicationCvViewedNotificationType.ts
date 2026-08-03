import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApplicationCvViewedNotificationType1786100100000 implements MigrationInterface {
  name = 'AddApplicationCvViewedNotificationType1786100100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'APPLICATION_CV_VIEWED'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot safely remove enum values without recreating the type.
  }
}
