import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminNotificationTypes1785700200000 implements MigrationInterface {
  name = 'AddAdminNotificationTypes1785700200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'ADMIN_COMPANY_REVIEW_REQUIRED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'ADMIN_JOB_REVIEW_REQUIRED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'ADMIN_JOB_REVISION_REVIEW_REQUIRED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'ADMIN_USER_RISK_DETECTED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'ADMIN_SYSTEM_ALERT'`,
    );
  }

  async down(): Promise<void> {
    // PostgreSQL enum values cannot be removed safely without rebuilding the type.
  }
}
