import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCandidateCvDeletedAt1784700100000 implements MigrationInterface {
  name = 'AddCandidateCvDeletedAt1784700100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('candidate_cvs', 'uq_candidate_cvs_candidate_default');
    await queryRunner.dropIndex('candidate_cvs', 'uq_candidate_cvs_candidate_document');
    await queryRunner.query(
      `ALTER TABLE "candidate_cvs" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidate_cvs" ADD "document_deleted_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "candidate_cvs" ADD "document_delete_error" text`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_candidate_cvs_candidate_default" ON "candidate_cvs" ("candidate_id") WHERE "is_default" = true AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_candidate_cvs_candidate_document" ON "candidate_cvs" ("candidate_id", "document_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_candidate_cvs_deleted_at" ON "candidate_cvs" ("deleted_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_candidate_cvs_document_deleted_at" ON "candidate_cvs" ("document_deleted_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_candidate_cvs_document_deleted_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_candidate_cvs_deleted_at"`);
    await queryRunner.query(`DROP INDEX "public"."uq_candidate_cvs_candidate_document"`);
    await queryRunner.query(`DROP INDEX "public"."uq_candidate_cvs_candidate_default"`);
    await queryRunner.query(`ALTER TABLE "candidate_cvs" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "candidate_cvs" DROP COLUMN "document_delete_error"`);
    await queryRunner.query(`ALTER TABLE "candidate_cvs" DROP COLUMN "document_deleted_at"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_candidate_cvs_candidate_document" ON "candidate_cvs" ("candidate_id", "document_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_candidate_cvs_candidate_default" ON "candidate_cvs" ("candidate_id") WHERE "is_default" = true`,
    );
  }
}
