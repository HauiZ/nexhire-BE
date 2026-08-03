import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAvatarDocumentId1785700000000 implements MigrationInterface {
  name = 'AddUserAvatarDocumentId1785700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "avatar_document_id" uuid`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_document_id"`);
  }
}
