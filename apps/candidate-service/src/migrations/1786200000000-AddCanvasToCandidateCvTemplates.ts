import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCanvasToCandidateCvTemplates1786200000000 implements MigrationInterface {
  name = 'AddCanvasToCandidateCvTemplates1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "candidate_cv_templates" ADD "canvas" jsonb NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "candidate_cv_templates" DROP COLUMN "canvas"`);
  }
}
