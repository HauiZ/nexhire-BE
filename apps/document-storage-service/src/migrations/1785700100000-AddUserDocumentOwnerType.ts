import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserDocumentOwnerType1785700100000 implements MigrationInterface {
  name = 'AddUserDocumentOwnerType1785700100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."document_owner_type_enum" ADD VALUE IF NOT EXISTS 'user'`,
    );
  }

  async down(): Promise<void> {
    // PostgreSQL enum values cannot be removed safely without rebuilding the type.
  }
}
