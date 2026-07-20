import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApplicationMatchSnapshot1784900100000 implements MigrationInterface {
  name = 'AddApplicationMatchSnapshot1784900100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "applications" ADD "match_score" double precision`);
    await queryRunner.query(`ALTER TABLE "applications" ADD "match_level" character varying(20)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "applications" DROP COLUMN "match_level"`);
    await queryRunner.query(`ALTER TABLE "applications" DROP COLUMN "match_score"`);
  }
}
