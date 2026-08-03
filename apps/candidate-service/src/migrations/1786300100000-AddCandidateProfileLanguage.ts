import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCandidateProfileLanguage1786300100000 implements MigrationInterface {
  name = 'AddCandidateProfileLanguage1786300100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "candidate_profiles" ADD "language" character varying(10) NOT NULL DEFAULT 'vi'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "candidate_profiles" DROP COLUMN "language"`);
  }
}
