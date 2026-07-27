import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyVerificationReviewTracking1785400000000 implements MigrationInterface {
  name = 'AddCompanyVerificationReviewTracking1785400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "verification_rejected_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`ALTER TABLE "companies" ADD "last_verification_rejected_reason" text`);
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "last_verification_rejected_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "verification_review_requested_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "verification_review_requested_by_user_id" uuid`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN "verification_review_requested_by_user_id"`,
    );
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "verification_review_requested_at"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "last_verification_rejected_at"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "last_verification_rejected_reason"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "verification_rejected_count"`);
  }
}
