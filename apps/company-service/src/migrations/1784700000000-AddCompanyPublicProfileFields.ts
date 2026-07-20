import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyPublicProfileFields1784700000000 implements MigrationInterface {
  name = 'AddCompanyPublicProfileFields1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "companies" ADD "industry" character varying(120)`);
    await queryRunner.query(`ALTER TABLE "companies" ADD "size" character varying(50)`);
    await queryRunner.query(`ALTER TABLE "companies" ADD "founded_year" integer`);
    await queryRunner.query(`ALTER TABLE "companies" ADD "mission" text`);
    await queryRunner.query(`ALTER TABLE "companies" ADD "culture" text`);
    await queryRunner.query(
      `ALTER TABLE "companies" ADD "values" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(`ALTER TABLE "companies" ADD "perks" text array NOT NULL DEFAULT '{}'`);
    await queryRunner.query(`ALTER TABLE "companies" ADD "hero_image_url" text`);
    await queryRunner.query(`ALTER TABLE "companies" ADD "hero_image_document_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "hero_image_document_id"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "hero_image_url"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "perks"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "values"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "culture"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "mission"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "founded_year"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "size"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "industry"`);
  }
}
