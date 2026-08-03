import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserLanguage1786300000000 implements MigrationInterface {
  name = 'AddUserLanguage1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "language" character varying(10) NOT NULL DEFAULT 'vi'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "language"`);
  }
}
