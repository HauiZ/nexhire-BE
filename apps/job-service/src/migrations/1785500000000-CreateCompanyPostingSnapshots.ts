import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCompanyPostingSnapshots1785500000000 implements MigrationInterface {
  name = 'CreateCompanyPostingSnapshots1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "company_posting_snapshots" (
        "company_id" uuid NOT NULL,
        "company_name" character varying(255),
        "company_logo_url" text,
        "company_logo_document_id" uuid,
        "company_status" "public"."company_status_snapshot_enum" NOT NULL,
        "company_trust_level" "public"."company_trust_level_enum" NOT NULL DEFAULT 'MEDIUM',
        "snapshot_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_company_posting_snapshots_company_id" PRIMARY KEY ("company_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "company_posting_snapshots"');
  }
}
