import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendCvTemplatePresetThumbnailUrl1786500000000 implements MigrationInterface {
  name = 'ExtendCvTemplatePresetThumbnailUrl1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cv_template_presets" ALTER COLUMN "thumbnail_url" TYPE text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cv_template_presets" ALTER COLUMN "thumbnail_url" TYPE character varying(1000)`,
    );
  }
}
