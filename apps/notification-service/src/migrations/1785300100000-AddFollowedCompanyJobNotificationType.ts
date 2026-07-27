import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFollowedCompanyJobNotificationType1785300100000
  implements MigrationInterface
{
  name = 'AddFollowedCompanyJobNotificationType1785300100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'COMPANY_FOLLOWED_JOB_PUBLISHED'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot safely remove enum values without recreating the type.
  }
}
