import { MigrationInterface, QueryRunner } from "typeorm";

export class CandidateServiceSchemaUpdate1784000391299 implements MigrationInterface {
    name = 'CandidateServiceSchemaUpdate1784000391299'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
        await queryRunner.query(`CREATE TYPE "public"."candidate_cv_parse_status_enum" AS ENUM('NOT_PARSED', 'PARSING', 'PARSED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "candidate_cvs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "candidate_id" uuid NOT NULL, "document_id" uuid NOT NULL, "title" character varying(255), "is_default" boolean NOT NULL DEFAULT false, "parse_status" "public"."candidate_cv_parse_status_enum" NOT NULL DEFAULT 'NOT_PARSED', "parsed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_candidate_cvs_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_candidate_cvs_candidate_default" ON "candidate_cvs" ("candidate_id") WHERE "is_default" = true`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_candidate_cvs_candidate_document" ON "candidate_cvs" ("candidate_id", "document_id") `);
        await queryRunner.query(`ALTER TABLE "candidate_cvs" ADD CONSTRAINT "fk_candidate_cvs_candidate_id" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "candidate_cvs" DROP CONSTRAINT "fk_candidate_cvs_candidate_id"`);
        await queryRunner.query(`DROP INDEX "public"."uq_candidate_cvs_candidate_document"`);
        await queryRunner.query(`DROP INDEX "public"."uq_candidate_cvs_candidate_default"`);
        await queryRunner.query(`DROP TABLE "candidate_cvs"`);
        await queryRunner.query(`DROP TYPE "public"."candidate_cv_parse_status_enum"`);
    }

}
