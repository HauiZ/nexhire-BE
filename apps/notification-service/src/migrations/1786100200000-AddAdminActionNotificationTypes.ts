import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminActionNotificationTypes1786100200000 implements MigrationInterface {
  name = 'AddAdminActionNotificationTypes1786100200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'JOB_REVIEW_RESULT_CHANGED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'JOB_REVISION_REVIEW_RESULT_CHANGED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'USER_LIFECYCLE_CHANGED'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot safely remove enum values without recreating the type.
  }
}
