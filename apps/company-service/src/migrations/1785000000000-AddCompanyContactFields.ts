import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyContactFields1785000000000 implements MigrationInterface {
  name = 'AddCompanyContactFields1785000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "companies" ADD "contact_email" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "companies" ADD "contact_phone" character varying(30)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT 1`);
  }
}
