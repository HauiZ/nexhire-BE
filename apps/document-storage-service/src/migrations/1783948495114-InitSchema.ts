import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1783948495114 implements MigrationInterface {
    name = 'InitSchema1783948495114'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
        await queryRunner.query(`CREATE TYPE "public"."document_type_enum" AS ENUM('CV', 'CERTIFICATE', 'PORTFOLIO', 'AVATAR', 'OTHER')`);
        await queryRunner.query(`CREATE TYPE "public"."document_owner_type_enum" AS ENUM('candidate', 'company', 'application')`);
        await queryRunner.query(`CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "document_type" "public"."document_type_enum" NOT NULL, "owner_type" "public"."document_owner_type_enum" NOT NULL, "owner_id" uuid NOT NULL, "file_name" character varying(255) NOT NULL, "mime_type" character varying(150) NOT NULL, "size" integer NOT NULL, "key" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "pk_documents_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_documents_key" ON "documents" ("key") `);
        await queryRunner.query(`CREATE INDEX "idx_documents_owner_type_owner_id_document_type" ON "documents" ("owner_type", "owner_id", "document_type") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_documents_owner_type_owner_id_document_type"`);
        await queryRunner.query(`DROP INDEX "public"."idx_documents_key"`);
        await queryRunner.query(`DROP TABLE "documents"`);
        await queryRunner.query(`DROP TYPE "public"."document_owner_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."document_type_enum"`);
    }

}
