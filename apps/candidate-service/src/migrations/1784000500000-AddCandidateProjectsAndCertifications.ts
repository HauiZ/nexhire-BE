import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCandidateProjectsAndCertifications1784000500000 implements MigrationInterface {
  name = 'AddCandidateProjectsAndCertifications1784000500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `CREATE TABLE "candidate_certifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "candidate_id" uuid NOT NULL, "name" character varying(255) NOT NULL, "issuer" character varying(255), "credential_url" text, "issued_year" integer, "description" text, "source" "public"."candidate_data_source_enum" NOT NULL DEFAULT 'MANUAL', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_candidate_certifications_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_candidate_certifications_candidate_id" ON "candidate_certifications" ("candidate_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "candidate_projects" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "candidate_id" uuid NOT NULL, "name" character varying(255) NOT NULL, "description" text, "technologies" text array NOT NULL DEFAULT '{}', "project_url" text, "source" "public"."candidate_data_source_enum" NOT NULL DEFAULT 'MANUAL', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_candidate_projects_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_candidate_projects_candidate_id" ON "candidate_projects" ("candidate_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "candidate_certifications" ADD CONSTRAINT "fk_candidate_certifications_candidate_id" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidate_projects" ADD CONSTRAINT "fk_candidate_projects_candidate_id" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "candidate_projects" DROP CONSTRAINT "fk_candidate_projects_candidate_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidate_certifications" DROP CONSTRAINT "fk_candidate_certifications_candidate_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_candidate_projects_candidate_id"`);
    await queryRunner.query(`DROP TABLE "candidate_projects"`);
    await queryRunner.query(`DROP INDEX "public"."idx_candidate_certifications_candidate_id"`);
    await queryRunner.query(`DROP TABLE "candidate_certifications"`);
  }
}
