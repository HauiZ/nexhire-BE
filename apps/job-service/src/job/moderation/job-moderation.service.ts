import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  JobExperienceLevel,
  JobModerationDecision,
  JobModerationRiskLevel,
  JobType,
  JobWorkingType,
} from '@nexhire/shared';
import { Repository } from 'typeorm';
import { CompanyPermissionSnapshot } from '../company/company-snapshot.service';
import { CompanyTrustLevel } from '../entities/job.enum';
import {
  JobModerationPolicy,
  JobModerationPolicyRules,
  JobModerationPolicyStatus,
} from '../entities/job-moderation-policy.entity';

export interface JobModerationInput {
  title: string;
  description: string;
  requirements: string;
  skills: string[];
  benefits?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  experienceLevel: JobExperienceLevel;
  workingType: JobWorkingType;
  employmentType: JobType;
  location: string;
}

export interface JobModerationResult {
  decision: JobModerationDecision;
  riskScore: number;
  riskLevel: JobModerationRiskLevel;
  reasons: string[];
  matchedRules: string[];
  policyId: string | null;
  policyVersion: number | null;
}

export const DEFAULT_JOB_MODERATION_POLICY_RULES: JobModerationPolicyRules = {
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
    id: String(id),
    keyword: String(keyword),
    score: Number(score),
    reason: String(reason),
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
      [JobExperienceLevel.INTERN]: { max: 10_000_000, score: 30 },
      [JobExperienceLevel.FRESHER]: { max: 18_000_000, score: 25 },
      [JobExperienceLevel.JUNIOR]: { max: 30_000_000, score: 20 },
      [JobExperienceLevel.MIDDLE]: { max: 50_000_000, score: 15 },
      [JobExperienceLevel.SENIOR]: { max: 80_000_000, score: 10 },
      [JobExperienceLevel.LEAD]: { max: 120_000_000, score: 10 },
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
    internshipNoExperienceSalaryMax: 20_000_000,
    internshipNoExperienceSalaryScore: 35,
  },
  companyTrustRules: {
    lowTrustScore: 20,
  },
};

@Injectable()
export class JobModerationService {
  constructor(
    @Optional()
    @InjectRepository(JobModerationPolicy)
    private readonly policyRepo?: Repository<JobModerationPolicy>,
  ) {}

  async moderate(
    job: JobModerationInput,
    company: Pick<CompanyPermissionSnapshot, 'companyTrustLevel'>,
    rulesOverride?: JobModerationPolicyRules,
  ): Promise<JobModerationResult> {
    const policy = rulesOverride ? null : await this.getActivePolicy();
    const rules = rulesOverride ?? policy?.rules ?? DEFAULT_JOB_MODERATION_POLICY_RULES;
    const reasons: string[] = [];
    const matchedRules: string[] = [];
    let riskScore = 0;

    const addRisk = (rule: string, score: number, reason: string) => {
      if (!matchedRules.includes(rule)) {
        matchedRules.push(rule);
        riskScore += this.safeScore(score);
        reasons.push(reason);
      }
    };

    const searchableText = this.normalizeText(
      `${job.title} ${job.description} ${job.requirements} ${job.skills.join(' ')} ${
        job.benefits ?? ''
      }`,
    );

    for (const item of rules.keywordRules.filter((rule) => rule.enabled !== false)) {
      if (searchableText.includes(this.normalizeText(item.keyword))) {
        addRisk(item.id, item.score, item.reason);
      }
    }

    this.scoreContentTransparency(job, rules, addRisk);
    this.scoreSalary(job, rules, addRisk);
    this.scoreLinks(searchableText, rules, addRisk);
    this.scoreSpamSignals(job, rules, addRisk);
    this.scoreCrossSignals(job, searchableText, rules, addRisk);

    if (company.companyTrustLevel === CompanyTrustLevel.LOW) {
      addRisk(
        'LOW_COMPANY_TRUST_LEVEL',
        rules.companyTrustRules.lowTrustScore,
        'Company has low trust level',
      );
    }

    riskScore = Math.min(riskScore, 100);
    const riskLevel = this.resolveRiskLevel(riskScore, rules);
    const decision = this.resolveDecision(riskLevel);

    return {
      decision,
      riskScore,
      riskLevel,
      reasons: reasons.length ? reasons : ['No risky content detected'],
      matchedRules,
      policyId: policy?.id ?? null,
      policyVersion: policy?.version ?? null,
    };
  }

  private async getActivePolicy(): Promise<JobModerationPolicy | null> {
    if (!this.policyRepo) {
      return null;
    }
    return this.policyRepo.findOne({
      where: { status: JobModerationPolicyStatus.ACTIVE },
      order: { updatedAt: 'DESC' },
    });
  }

  private scoreContentTransparency(
    job: JobModerationInput,
    rules: JobModerationPolicyRules,
    addRisk: (rule: string, points: number, reason: string) => void,
  ): void {
    const descriptionLength = this.stripHtml(job.description).length;
    if (descriptionLength < rules.contentRules.minDescriptionLength) {
      addRisk(
        'LOW_DESCRIPTION_LENGTH',
        rules.contentRules.descriptionScore,
        'Job description is too short',
      );
    }
    if (this.stripHtml(job.requirements).length < rules.contentRules.minRequirementsLength) {
      addRisk(
        'MISSING_OR_WEAK_REQUIREMENTS',
        rules.contentRules.requirementsScore,
        'Job requirements are missing or too vague',
      );
    }
    if (!job.location.trim() || job.location.trim().length < 2) {
      addRisk(
        'MISSING_LOCATION',
        rules.contentRules.missingLocationScore,
        'Job location is missing or unclear',
      );
    }
  }

  private scoreSalary(
    job: JobModerationInput,
    rules: JobModerationPolicyRules,
    addRisk: (rule: string, points: number, reason: string) => void,
  ): void {
    const threshold = rules.salaryRules.maxByExperienceLevel[job.experienceLevel];
    if (!threshold) {
      return;
    }
    if (job.salaryMax && job.salaryMax > threshold.max) {
      addRisk(
        'ABNORMAL_SALARY_BY_EXPERIENCE_LEVEL',
        threshold.score,
        `Salary is unusually high for ${job.experienceLevel} level`,
      );
    }
  }

  private scoreLinks(
    searchableText: string,
    rules: JobModerationPolicyRules,
    addRisk: (rule: string, points: number, reason: string) => void,
  ): void {
    if (rules.linkRules.shortenedDomains.some((domain) => searchableText.includes(domain))) {
      addRisk(
        'RISK_SHORTENED_URL',
        rules.linkRules.shortenedUrlScore,
        'Job content contains a shortened URL',
      );
    }

    const externalLinkCount = (searchableText.match(/https?:\/\//g) ?? []).length;
    if (externalLinkCount > rules.linkRules.maxExternalLinks) {
      addRisk(
        'TOO_MANY_EXTERNAL_LINKS',
        rules.linkRules.tooManyExternalLinksScore,
        'Job content contains too many external links',
      );
    }
    if (rules.linkRules.externalFormDomains.some((domain) => searchableText.includes(domain))) {
      addRisk(
        'RISK_EXTERNAL_FORM',
        rules.linkRules.externalFormScore,
        'Job content links to an external form',
      );
    }
  }

  private scoreSpamSignals(
    job: JobModerationInput,
    rules: JobModerationPolicyRules,
    addRisk: (rule: string, points: number, reason: string) => void,
  ): void {
    const title = job.title.trim();
    if (title.length > 20 && title === title.toUpperCase() && /[A-Z]/.test(title)) {
      addRisk('TITLE_ALL_CAPS', rules.spamRules.allCapsTitleScore, 'Job title is all caps');
    }

    const symbolCount = (title.match(/[!@#$%^&*_=+~|/\\]{1}/g) ?? []).length;
    if (symbolCount > rules.spamRules.maxTitleSymbols) {
      addRisk(
        'EXCESSIVE_SYMBOLS_IN_TITLE',
        rules.spamRules.excessiveSymbolsScore,
        'Job title contains excessive symbols',
      );
    }

    const words = this.normalizeText(`${job.title} ${job.description}`).split(/\s+/);
    const repeatedWord = words.find(
      (word) =>
        word.length > 4 &&
        words.filter((w) => w === word).length > rules.spamRules.repeatedWordThreshold,
    );
    if (repeatedWord) {
      addRisk(
        'KEYWORD_STUFFING',
        rules.spamRules.repeatedWordScore,
        'Job content repeats the same keyword too many times',
      );
    }
  }

  private scoreCrossSignals(
    job: JobModerationInput,
    searchableText: string,
    rules: JobModerationPolicyRules,
    addRisk: (rule: string, points: number, reason: string) => void,
  ): void {
    if (
      job.workingType === JobWorkingType.REMOTE &&
      rules.crossSignalRules.upfrontPaymentSignals.some((signal) => searchableText.includes(signal))
    ) {
      addRisk(
        'REMOTE_JOB_WITH_UPFRONT_PAYMENT',
        rules.crossSignalRules.remoteUpfrontPaymentScore,
        'Remote job asks for upfront payment',
      );
    }

    if (
      job.employmentType === JobType.INTERNSHIP &&
      (job.salaryMax ?? 0) > rules.crossSignalRules.internshipNoExperienceSalaryMax &&
      searchableText.includes('khong can kinh nghiem')
    ) {
      addRisk(
        'INTERNSHIP_UNREALISTIC_NO_EXPERIENCE_SALARY',
        rules.crossSignalRules.internshipNoExperienceSalaryScore,
        'Internship combines no-experience language with unusually high salary',
      );
    }
  }

  private resolveRiskLevel(
    riskScore: number,
    rules: JobModerationPolicyRules,
  ): JobModerationRiskLevel {
    if (riskScore >= rules.thresholds.critical) {
      return JobModerationRiskLevel.CRITICAL;
    }
    if (riskScore >= rules.thresholds.high) {
      return JobModerationRiskLevel.HIGH;
    }
    if (riskScore >= rules.thresholds.medium) {
      return JobModerationRiskLevel.MEDIUM;
    }
    return JobModerationRiskLevel.LOW;
  }

  private resolveDecision(riskLevel: JobModerationRiskLevel): JobModerationDecision {
    if (riskLevel === JobModerationRiskLevel.CRITICAL) {
      return JobModerationDecision.SHOULD_REJECT;
    }
    if (riskLevel === JobModerationRiskLevel.HIGH || riskLevel === JobModerationRiskLevel.MEDIUM) {
      return JobModerationDecision.NEEDS_REVIEW;
    }
    return JobModerationDecision.PENDING_REVIEW;
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  private stripHtml(value: string): string {
    return value.replace(/<[^>]*>/g, '').trim();
  }

  private safeScore(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  }
}
