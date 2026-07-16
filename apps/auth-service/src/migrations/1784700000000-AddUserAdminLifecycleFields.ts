import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAdminLifecycleFields1784700000000 implements MigrationInterface {
  name = 'AddUserAdminLifecycleFields1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."user_status_enum" ADD VALUE IF NOT EXISTS 'BANNED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."user_status_enum" ADD VALUE IF NOT EXISTS 'ARCHIVED'`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "status_reason" text`);
    await queryRunner.query(`ALTER TABLE "users" ADD "status_changed_by" uuid`);
    await queryRunner.query(`ALTER TABLE "users" ADD "status_changed_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "users" ADD "suspended_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "users" ADD "banned_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "users" ADD "archived_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`CREATE INDEX "idx_users_status" ON "users" ("status")`);
    await queryRunner.query(
      `CREATE INDEX "idx_users_status_changed_at" ON "users" ("status_changed_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_users_status_changed_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_users_status"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "archived_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "banned_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "suspended_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "status_changed_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "status_changed_by"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "status_reason"`);
  }
}
