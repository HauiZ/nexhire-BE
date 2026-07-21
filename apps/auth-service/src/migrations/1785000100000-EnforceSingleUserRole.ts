import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceSingleUserRole1785000100000 implements MigrationInterface {
  name = 'EnforceSingleUserRole1785000100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_user_roles_user_id" ON "user_roles" ("user_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT 1`);
  }
}
