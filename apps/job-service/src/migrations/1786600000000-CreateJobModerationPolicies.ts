import { MigrationInterface, QueryRunner } from 'typeorm';

const defaultRules = {
  thresholds: { medium: 25, high: 50, critical: 80 },
  keywordRules: [
    ['RISK_KEYWORD_EASY_MONEY', 'viec nhe luong cao', 30, 'Job content promises easy high income'],
    [
      'RISK_KEYWORD_UNREALISTIC_PROMISE',
      'khong can kinh nghiem luong cao',
      25,
      'Job content makes unrealistic no-experience income promises',
    ],
    [
      'RISK_KEYWORD_UNREALISTIC_REMOTE_INCOME',
      'lam tai nha thu nhap khung',
      25,
      'Remote income promise looks unrealistic',
    ],
    [
      'RISK_KEYWORD_INCOME_GUARANTEE',
      'cam ket thu nhap',
      20,
      'Job content guarantees income without clear basis',
    ],
    [
      'RISK_KEYWORD_UNLIMITED_INCOME',
      'thu nhap khong gioi han',
      15,
      'Job content uses unlimited income language',
    ],
    [
      'RISK_KEYWORD_MASS_HIRING',
      'tuyen gap so luong lon',
      10,
      'Job content uses mass hiring urgency language',
    ],
    [
      'RISK_KEYWORD_NO_INTERVIEW',
      'khong can phong van',
      25,
      'Job content says no interview is needed',
    ],
    [
      'RISK_KEYWORD_INSTANT_HIRING',
      'nhan viec ngay trong ngay',
      15,
      'Job content promises same-day hiring',
    ],
    ['RISK_KEYWORD_UPFRONT_FEE', 'dong phi', 50, 'Job content asks candidates to pay a fee'],
    ['RISK_KEYWORD_APPLICATION_FEE', 'phi ho so', 50, 'Job content mentions an application fee'],
    ['RISK_KEYWORD_TRAINING_FEE', 'phi dao tao', 40, 'Job content mentions a training fee'],
    ['RISK_KEYWORD_UNIFORM_FEE', 'phi dong phuc', 35, 'Job content mentions a uniform fee'],
    [
      'RISK_KEYWORD_ADVANCE_TRANSFER',
      'chuyen khoan truoc',
      60,
      'Job content asks for advance transfer',
    ],
    ['RISK_KEYWORD_DEPOSIT', 'dat coc', 50, 'Job content asks for a deposit'],
    ['RISK_KEYWORD_TOP_UP', 'nap tien', 60, 'Job content asks candidates to top up money'],
    [
      'RISK_KEYWORD_BUY_ACCOUNT',
      'mua tai khoan',
      60,
      'Job content asks candidates to buy an account',
    ],
    [
      'RISK_KEYWORD_TELEGRAM_CONTACT',
      'telegram',
      20,
      'Job content pushes communication to Telegram',
    ],
    [
      'RISK_KEYWORD_PRIVATE_ZALO',
      'zalo rieng',
      15,
      'Job content pushes communication to private Zalo',
    ],
    [
      'RISK_KEYWORD_PRIVATE_INBOX',
      'inbox rieng',
      10,
      'Job content pushes private inbox communication',
    ],
    [
      'RISK_KEYWORD_OFF_PLATFORM_CONTACT',
      'lien he ngoai he thong',
      20,
      'Job content asks candidates to contact outside the platform',
    ],
    [
      'RISK_KEYWORD_EXTERNAL_LINK',
      'click link',
      15,
      'Job content asks candidates to click an external link',
    ],
    [
      'RISK_SENSITIVE_DOCUMENT_REQUEST',
      'can cuoc cong dan',
      25,
      'Job content asks for sensitive identity documents too early',
    ],
    [
      'RISK_SENSITIVE_DOCUMENT_REQUEST',
      'cccd',
      25,
      'Job content asks for sensitive identity documents too early',
    ],
    [
      'RISK_SENSITIVE_DOCUMENT_REQUEST',
      'chung minh nhan dan',
      25,
      'Job content asks for sensitive identity documents too early',
    ],
    [
      'RISK_SENSITIVE_DOCUMENT_REQUEST',
      'cmnd',
      25,
      'Job content asks for sensitive identity documents too early',
    ],
    [
      'RISK_SENSITIVE_HOUSEHOLD_DOCUMENT',
      'so ho khau',
      30,
      'Job content asks for household registration documents',
    ],
    ['RISK_BANK_CARD_REQUEST', 'anh the ngan hang', 60, 'Job content asks for bank card images'],
    [
      'RISK_BANK_INFO_REQUEST',
      'so tai khoan ngan hang',
      35,
      'Job content asks for bank account information too early',
    ],
  ].map(([id, keyword, score, reason]) => ({
    id,
    keyword,
    score,
    reason,
    enabled: true,
  })),
  contentRules: {
    minDescriptionLength: 100,
    descriptionScore: 20,
    minRequirementsLength: 30,
    requirementsScore: 15,
    missingLocationScore: 15,
  },
  salaryRules: {
    maxByExperienceLevel: {
      INTERN: { max: 10000000, score: 30 },
      FRESHER: { max: 18000000, score: 25 },
      JUNIOR: { max: 30000000, score: 20 },
      MIDDLE: { max: 50000000, score: 15 },
      SENIOR: { max: 80000000, score: 10 },
      LEAD: { max: 120000000, score: 10 },
    },
  },
  linkRules: {
    shortenedDomains: ['bit.ly', 'tinyurl', 'goo.gl', 'cutt.ly', 'shorturl.at'],
    shortenedUrlScore: 25,
    maxExternalLinks: 3,
    tooManyExternalLinksScore: 20,
    externalFormDomains: ['forms.gle'],
    externalFormScore: 10,
  },
  spamRules: {
    allCapsTitleScore: 10,
    maxTitleSymbols: 5,
    excessiveSymbolsScore: 10,
    repeatedWordThreshold: 12,
    repeatedWordScore: 10,
  },
  crossSignalRules: {
    upfrontPaymentSignals: ['dong phi', 'dat coc', 'chuyen khoan truoc', 'nap tien'],
    remoteUpfrontPaymentScore: 60,
    internshipNoExperienceSalaryMax: 20000000,
    internshipNoExperienceSalaryScore: 35,
  },
  companyTrustRules: {
    lowTrustScore: 20,
  },
};

export class CreateJobModerationPolicies1786600000000 implements MigrationInterface {
  name = 'CreateJobModerationPolicies1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TYPE "job_moderation_policy_status_enum" AS ENUM ('DRAFT', 'ACTIVE', 'UNPUBLISHED', 'ARCHIVED')
    `);
    await queryRunner.query(`
      CREATE TABLE "job_moderation_policies" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(255) NOT NULL,
        "status" "job_moderation_policy_status_enum" NOT NULL DEFAULT 'DRAFT',
        "version" integer NOT NULL DEFAULT 1,
        "rules" jsonb NOT NULL,
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_job_moderation_policies_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_job_moderation_policies_status" ON "job_moderation_policies" ("status")
    `);

    await queryRunner.query(`ALTER TABLE "jobs" ADD "moderation_policy_id" uuid`);
    await queryRunner.query(`ALTER TABLE "jobs" ADD "moderation_policy_version" integer`);
    await queryRunner.query(`ALTER TABLE "job_revisions" ADD "moderation_policy_id" uuid`);
    await queryRunner.query(`ALTER TABLE "job_revisions" ADD "moderation_policy_version" integer`);
    await queryRunner.query(`ALTER TABLE "job_moderation_reviews" ADD "moderation_policy_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "job_moderation_reviews" ADD "moderation_policy_version" integer`,
    );

    await queryRunner.query(
      `
        INSERT INTO "job_moderation_policies" ("name", "status", "version", "rules")
        VALUES ($1, 'ACTIVE', 1, $2::jsonb)
      `,
      ['Default job moderation policy', JSON.stringify(defaultRules)],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_moderation_reviews" DROP COLUMN "moderation_policy_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_moderation_reviews" DROP COLUMN "moderation_policy_id"`,
    );
    await queryRunner.query(`ALTER TABLE "job_revisions" DROP COLUMN "moderation_policy_version"`);
    await queryRunner.query(`ALTER TABLE "job_revisions" DROP COLUMN "moderation_policy_id"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "moderation_policy_version"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "moderation_policy_id"`);
    await queryRunner.query(`DROP INDEX "idx_job_moderation_policies_status"`);
    await queryRunner.query(`DROP TABLE "job_moderation_policies"`);
    await queryRunner.query(`DROP TYPE "job_moderation_policy_status_enum"`);
  }
}
