import { Injectable } from '@nestjs/common';
import {
  JobExperienceLevel,
  JobModerationDecision,
  JobModerationRiskLevel,
  JobType,
  JobWorkingType,
} from '@nexhire/shared';
import { CompanyPermissionSnapshot } from './company-snapshot.service';
import { CompanyTrustLevel } from './entities/job.enum';

export interface JobModerationInput {
  title: string;
  description: string;
  requirements: string;
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
}

interface KeywordRule {
  keyword: string;
  points: number;
  rule: string;
  reason: string;
}

@Injectable()
export class JobModerationService {
  moderate(
    job: JobModerationInput,
    company: Pick<CompanyPermissionSnapshot, 'companyTrustLevel'>,
  ): JobModerationResult {
    const reasons: string[] = [];
    const matchedRules: string[] = [];
    let riskScore = 0;

    const addRisk = (rule: string, points: number, reason: string) => {
      if (!matchedRules.includes(rule)) {
        matchedRules.push(rule);
      }
      riskScore += points;
      reasons.push(reason);
    };

    const searchableText = this.normalizeText(
      `${job.title} ${job.description} ${job.requirements} ${job.benefits ?? ''}`,
    );

    for (const item of this.keywordRules()) {
      if (searchableText.includes(this.normalizeText(item.keyword))) {
        addRisk(item.rule, item.points, item.reason);
      }
    }

    this.scoreContentTransparency(job, addRisk);
    this.scoreSalary(job, addRisk);
    this.scoreLinks(searchableText, addRisk);
    this.scoreSpamSignals(job, addRisk);
    this.scoreCrossSignals(job, searchableText, addRisk);

    if (company.companyTrustLevel === CompanyTrustLevel.LOW) {
      addRisk('LOW_COMPANY_TRUST_LEVEL', 20, 'Company has low trust level');
    }

    riskScore = Math.min(riskScore, 100);
    const riskLevel = this.resolveRiskLevel(riskScore);
    const decision = this.resolveDecision(riskLevel);

    return {
      decision,
      riskScore,
      riskLevel,
      reasons: reasons.length ? reasons : ['No risky content detected'],
      matchedRules,
    };
  }

  private keywordRules(): KeywordRule[] {
    return [
      {
        keyword: 'viec nhe luong cao',
        points: 30,
        rule: 'RISK_KEYWORD_EASY_MONEY',
        reason: 'Job content promises easy high income',
      },
      {
        keyword: 'khong can kinh nghiem luong cao',
        points: 25,
        rule: 'RISK_KEYWORD_UNREALISTIC_PROMISE',
        reason: 'Job content makes unrealistic no-experience income promises',
      },
      {
        keyword: 'lam tai nha thu nhap khung',
        points: 25,
        rule: 'RISK_KEYWORD_UNREALISTIC_REMOTE_INCOME',
        reason: 'Remote income promise looks unrealistic',
      },
      {
        keyword: 'cam ket thu nhap',
        points: 20,
        rule: 'RISK_KEYWORD_INCOME_GUARANTEE',
        reason: 'Job content guarantees income without clear basis',
      },
      {
        keyword: 'thu nhap khong gioi han',
        points: 15,
        rule: 'RISK_KEYWORD_UNLIMITED_INCOME',
        reason: 'Job content uses unlimited income language',
      },
      {
        keyword: 'tuyen gap so luong lon',
        points: 10,
        rule: 'RISK_KEYWORD_MASS_HIRING',
        reason: 'Job content uses mass hiring urgency language',
      },
      {
        keyword: 'khong can phong van',
        points: 25,
        rule: 'RISK_KEYWORD_NO_INTERVIEW',
        reason: 'Job content says no interview is needed',
      },
      {
        keyword: 'nhan viec ngay trong ngay',
        points: 15,
        rule: 'RISK_KEYWORD_INSTANT_HIRING',
        reason: 'Job content promises same-day hiring',
      },
      {
        keyword: 'dong phi',
        points: 50,
        rule: 'RISK_KEYWORD_UPFRONT_FEE',
        reason: 'Job content asks candidates to pay a fee',
      },
      {
        keyword: 'phi ho so',
        points: 50,
        rule: 'RISK_KEYWORD_APPLICATION_FEE',
        reason: 'Job content mentions an application fee',
      },
      {
        keyword: 'phi dao tao',
        points: 40,
        rule: 'RISK_KEYWORD_TRAINING_FEE',
        reason: 'Job content mentions a training fee',
      },
      {
        keyword: 'phi dong phuc',
        points: 35,
        rule: 'RISK_KEYWORD_UNIFORM_FEE',
        reason: 'Job content mentions a uniform fee',
      },
      {
        keyword: 'chuyen khoan truoc',
        points: 60,
        rule: 'RISK_KEYWORD_ADVANCE_TRANSFER',
        reason: 'Job content asks for advance transfer',
      },
      {
        keyword: 'dat coc',
        points: 50,
        rule: 'RISK_KEYWORD_DEPOSIT',
        reason: 'Job content asks for a deposit',
      },
      {
        keyword: 'nap tien',
        points: 60,
        rule: 'RISK_KEYWORD_TOP_UP',
        reason: 'Job content asks candidates to top up money',
      },
      {
        keyword: 'mua tai khoan',
        points: 60,
        rule: 'RISK_KEYWORD_BUY_ACCOUNT',
        reason: 'Job content asks candidates to buy an account',
      },
      {
        keyword: 'telegram',
        points: 20,
        rule: 'RISK_KEYWORD_TELEGRAM_CONTACT',
        reason: 'Job content pushes communication to Telegram',
      },
      {
        keyword: 'zalo rieng',
        points: 15,
        rule: 'RISK_KEYWORD_PRIVATE_ZALO',
        reason: 'Job content pushes communication to private Zalo',
      },
      {
        keyword: 'inbox rieng',
        points: 10,
        rule: 'RISK_KEYWORD_PRIVATE_INBOX',
        reason: 'Job content pushes private inbox communication',
      },
      {
        keyword: 'lien he ngoai he thong',
        points: 20,
        rule: 'RISK_KEYWORD_OFF_PLATFORM_CONTACT',
        reason: 'Job content asks candidates to contact outside the platform',
      },
      {
        keyword: 'click link',
        points: 15,
        rule: 'RISK_KEYWORD_EXTERNAL_LINK',
        reason: 'Job content asks candidates to click an external link',
      },
      {
        keyword: 'can cuoc cong dan',
        points: 25,
        rule: 'RISK_SENSITIVE_DOCUMENT_REQUEST',
        reason: 'Job content asks for sensitive identity documents too early',
      },
      {
        keyword: 'cccd',
        points: 25,
        rule: 'RISK_SENSITIVE_DOCUMENT_REQUEST',
        reason: 'Job content asks for sensitive identity documents too early',
      },
      {
        keyword: 'chung minh nhan dan',
        points: 25,
        rule: 'RISK_SENSITIVE_DOCUMENT_REQUEST',
        reason: 'Job content asks for sensitive identity documents too early',
      },
      {
        keyword: 'cmnd',
        points: 25,
        rule: 'RISK_SENSITIVE_DOCUMENT_REQUEST',
        reason: 'Job content asks for sensitive identity documents too early',
      },
      {
        keyword: 'so ho khau',
        points: 30,
        rule: 'RISK_SENSITIVE_HOUSEHOLD_DOCUMENT',
        reason: 'Job content asks for household registration documents',
      },
      {
        keyword: 'anh the ngan hang',
        points: 60,
        rule: 'RISK_BANK_CARD_REQUEST',
        reason: 'Job content asks for bank card images',
      },
      {
        keyword: 'so tai khoan ngan hang',
        points: 35,
        rule: 'RISK_BANK_INFO_REQUEST',
        reason: 'Job content asks for bank account information too early',
      },
    ];
  }

  private scoreContentTransparency(
    job: JobModerationInput,
    addRisk: (rule: string, points: number, reason: string) => void,
  ): void {
    const descriptionLength = this.stripHtml(job.description).length;
    if (descriptionLength < 100) {
      addRisk('LOW_DESCRIPTION_LENGTH', 20, 'Job description is too short');
    }
    if (this.stripHtml(job.requirements).length < 30) {
      addRisk('MISSING_OR_WEAK_REQUIREMENTS', 15, 'Job requirements are missing or too vague');
    }
    if (!job.location.trim() || job.location.trim().length < 2) {
      addRisk('MISSING_LOCATION', 15, 'Job location is missing or unclear');
    }
  }

  private scoreSalary(
    job: JobModerationInput,
    addRisk: (rule: string, points: number, reason: string) => void,
  ): void {
    const salaryMaxByLevel: Record<JobExperienceLevel, { max: number; points: number }> = {
      [JobExperienceLevel.INTERN]: { max: 10_000_000, points: 30 },
      [JobExperienceLevel.FRESHER]: { max: 18_000_000, points: 25 },
      [JobExperienceLevel.JUNIOR]: { max: 30_000_000, points: 20 },
      [JobExperienceLevel.MIDDLE]: { max: 50_000_000, points: 15 },
      [JobExperienceLevel.SENIOR]: { max: 80_000_000, points: 10 },
      [JobExperienceLevel.LEAD]: { max: 120_000_000, points: 10 },
    };

    const threshold = salaryMaxByLevel[job.experienceLevel];
    if (job.salaryMax && job.salaryMax > threshold.max) {
      addRisk(
        'ABNORMAL_SALARY_BY_EXPERIENCE_LEVEL',
        threshold.points,
        `Salary is unusually high for ${job.experienceLevel} level`,
      );
    }
  }

  private scoreLinks(
    searchableText: string,
    addRisk: (rule: string, points: number, reason: string) => void,
  ): void {
    const shortenedDomains = ['bit.ly', 'tinyurl', 'goo.gl', 'cutt.ly', 'shorturl.at'];
    if (shortenedDomains.some((domain) => searchableText.includes(domain))) {
      addRisk('RISK_SHORTENED_URL', 25, 'Job content contains a shortened URL');
    }

    const externalLinkCount = (searchableText.match(/https?:\/\//g) ?? []).length;
    if (externalLinkCount > 3) {
      addRisk('TOO_MANY_EXTERNAL_LINKS', 20, 'Job content contains too many external links');
    }
    if (searchableText.includes('forms.gle')) {
      addRisk('RISK_EXTERNAL_FORM', 10, 'Job content links to an external form');
    }
  }

  private scoreSpamSignals(
    job: JobModerationInput,
    addRisk: (rule: string, points: number, reason: string) => void,
  ): void {
    const title = job.title.trim();
    if (title.length > 20 && title === title.toUpperCase() && /[A-Z]/.test(title)) {
      addRisk('TITLE_ALL_CAPS', 10, 'Job title is all caps');
    }

    const symbolCount = (title.match(/[!@#$%^&*_=+~|/\\]{1}/g) ?? []).length;
    if (symbolCount > 5) {
      addRisk('EXCESSIVE_SYMBOLS_IN_TITLE', 10, 'Job title contains excessive symbols');
    }

    const words = this.normalizeText(`${job.title} ${job.description}`).split(/\s+/);
    const repeatedWord = words.find(
      (word) => word.length > 4 && words.filter((w) => w === word).length > 12,
    );
    if (repeatedWord) {
      addRisk('KEYWORD_STUFFING', 10, 'Job content repeats the same keyword too many times');
    }
  }

  private scoreCrossSignals(
    job: JobModerationInput,
    searchableText: string,
    addRisk: (rule: string, points: number, reason: string) => void,
  ): void {
    const upfrontPaymentSignals = ['dong phi', 'dat coc', 'chuyen khoan truoc', 'nap tien'];
    if (
      job.workingType === JobWorkingType.REMOTE &&
      upfrontPaymentSignals.some((signal) => searchableText.includes(signal))
    ) {
      addRisk('REMOTE_JOB_WITH_UPFRONT_PAYMENT', 60, 'Remote job asks for upfront payment');
    }

    if (
      job.employmentType === JobType.INTERNSHIP &&
      (job.salaryMax ?? 0) > 20_000_000 &&
      searchableText.includes('khong can kinh nghiem')
    ) {
      addRisk(
        'INTERNSHIP_UNREALISTIC_NO_EXPERIENCE_SALARY',
        35,
        'Internship combines no-experience language with unusually high salary',
      );
    }
  }

  private resolveRiskLevel(riskScore: number): JobModerationRiskLevel {
    if (riskScore >= 80) {
      return JobModerationRiskLevel.CRITICAL;
    }
    if (riskScore >= 50) {
      return JobModerationRiskLevel.HIGH;
    }
    if (riskScore >= 25) {
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
}
