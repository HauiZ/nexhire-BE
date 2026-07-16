import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyVerificationNotificationType1784400200000 implements MigrationInterface {
  name = 'AddCompanyVerificationNotificationType1784400200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'COMPANY_VERIFICATION_CHANGED'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot safely remove enum values without recreating the type.
  }
}
