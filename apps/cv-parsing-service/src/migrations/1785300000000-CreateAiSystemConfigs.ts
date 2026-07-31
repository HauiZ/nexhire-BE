import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiSystemConfigs1785300000000 implements MigrationInterface {
  name = 'CreateAiSystemConfigs1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "ai_system_configs" ("config_key" character varying(120) NOT NULL, "config_value" text NOT NULL, "updated_by_user_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_ai_system_configs_key" PRIMARY KEY ("config_key"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_system_configs"`);
  }
}
