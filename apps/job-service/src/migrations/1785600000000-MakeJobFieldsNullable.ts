import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeJobFieldsNullable1785600000000 implements MigrationInterface {
  name = 'MakeJobFieldsNullable1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "description" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "requirements" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "employment_type" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "working_type" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "experience_level" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "location" DROP NOT NULL`);

    await queryRunner.query(`ALTER TABLE "job_revisions" ALTER COLUMN "description" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "job_revisions" ALTER COLUMN "requirements" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "job_revisions" ALTER COLUMN "employment_type" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "job_revisions" ALTER COLUMN "working_type" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "job_revisions" ALTER COLUMN "experience_level" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "job_revisions" ALTER COLUMN "location" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "description" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "requirements" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "employment_type" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "working_type" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "experience_level" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "location" SET NOT NULL`);

    await queryRunner.query(`ALTER TABLE "job_revisions" ALTER COLUMN "description" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "job_revisions" ALTER COLUMN "requirements" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "job_revisions" ALTER COLUMN "employment_type" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "job_revisions" ALTER COLUMN "working_type" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "job_revisions" ALTER COLUMN "experience_level" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "job_revisions" ALTER COLUMN "location" SET NOT NULL`);
  }
}
