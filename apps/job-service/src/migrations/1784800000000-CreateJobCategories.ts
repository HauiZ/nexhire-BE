import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_CATEGORIES = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Engineering',
    slug: 'engineering',
    description: 'Software engineering, infrastructure, QA, and technical roles',
    sortOrder: 10,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Design',
    slug: 'design',
    description: 'Product design, UI/UX, research, and creative roles',
    sortOrder: 20,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Data',
    slug: 'data',
    description: 'Data analysis, data engineering, analytics, and AI roles',
    sortOrder: 30,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Marketing',
    slug: 'marketing',
    description: 'Growth, brand, content, and performance marketing roles',
    sortOrder: 40,
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Customer Success',
    slug: 'customer-success',
    description: 'Customer success, support, onboarding, and account roles',
    sortOrder: 50,
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    name: 'Business',
    slug: 'business',
    description: 'Operations, sales, finance, HR, and business roles',
    sortOrder: 60,
  },
];

export class CreateJobCategories1784800000000 implements MigrationInterface {
  name = 'CreateJobCategories1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE "job_categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(120) NOT NULL,
        "slug" varchar(140) NOT NULL,
        "description" text,
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "pk_job_categories_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_job_categories_slug" ON "job_categories" ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_job_categories_active_sort" ON "job_categories" ("is_active", "sort_order")`,
    );

    for (const category of DEFAULT_CATEGORIES) {
      await queryRunner.query(
        `
          INSERT INTO "job_categories" ("id", "name", "slug", "description", "sort_order", "is_active")
          VALUES ($1, $2, $3, $4, $5, true)
        `,
        [
          category.id,
          category.name,
          category.slug,
          category.description,
          category.sortOrder,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_job_categories_active_sort"`);
    await queryRunner.query(`DROP INDEX "uq_job_categories_slug"`);
    await queryRunner.query(`DROP TABLE "job_categories"`);
  }
}
