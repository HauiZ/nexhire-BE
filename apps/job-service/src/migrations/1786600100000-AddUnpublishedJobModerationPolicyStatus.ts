import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnpublishedJobModerationPolicyStatus1786600100000 implements MigrationInterface {
  name = 'AddUnpublishedJobModerationPolicyStatus1786600100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "job_moderation_policy_status_enum" ADD VALUE IF NOT EXISTS 'UNPUBLISHED'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support dropping enum values safely.
  }
}
