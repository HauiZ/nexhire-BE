import {
  JobExperienceLevel,
  JobModerationDecision,
  JobType,
  JobWorkingType,
} from '@nexhire/shared';
import { CompanyTrustLevel } from '../entities/job.enum';
import { JobModerationService } from '../moderation/job-moderation.service';

describe('JobModerationService', () => {
  let service: JobModerationService;

  beforeEach(() => {
    service = new JobModerationService();
  });

  it('classifies safe content as pending review for manual admin approval', () => {
    const result = service.moderate(
      {
        title: 'Backend Developer',
        description:
          'Develop and maintain REST APIs for a recruitment platform using NestJS, PostgreSQL, and RabbitMQ with a collaborative engineering team.',
        requirements:
          'At least one year of experience with Node.js, TypeScript, PostgreSQL, Git, and REST API development.',
        skills: ['NestJS', 'PostgreSQL', 'RabbitMQ'],
        benefits: 'Hybrid work, insurance, learning budget, and annual performance review.',
        salaryMin: 15_000_000,
        salaryMax: 25_000_000,
        experienceLevel: JobExperienceLevel.JUNIOR,
        workingType: JobWorkingType.HYBRID,
        employmentType: JobType.FULL_TIME,
        location: 'Ha Noi, Viet Nam',
      },
      { companyTrustLevel: CompanyTrustLevel.MEDIUM },
    );

    expect(result.decision).toBe(JobModerationDecision.PENDING_REVIEW);
    expect(result.riskScore).toBe(0);
    expect(result.matchedRules).toEqual([]);
  });

  it('classifies suspicious remote income content as needs review', () => {
    const result = service.moderate(
      {
        title: 'Remote Sales Collaborator',
        description:
          'Support customer outreach and weekly reporting. Lien he telegram de trao doi them ve lich lam viec.',
        requirements: 'Can giao tiep tot.',
        skills: ['Sales'],
        salaryMin: 10_000_000,
        salaryMax: 15_000_000,
        experienceLevel: JobExperienceLevel.FRESHER,
        workingType: JobWorkingType.REMOTE,
        employmentType: JobType.PART_TIME,
        location: 'Remote',
      },
      { companyTrustLevel: CompanyTrustLevel.MEDIUM },
    );

    expect(result.decision).toBe(JobModerationDecision.NEEDS_REVIEW);
    expect(result.riskScore).toBeGreaterThanOrEqual(50);
    expect(result.matchedRules).toContain('RISK_KEYWORD_TELEGRAM_CONTACT');
    expect(result.matchedRules).toContain('LOW_DESCRIPTION_LENGTH');
  });

  it('classifies upfront payment scam signals as should reject', () => {
    const result = service.moderate(
      {
        title: 'Cong tac vien online',
        description:
          'Ung vien can dong phi ho so va chuyen khoan truoc de nhan viec. Vui long nap tien theo huong dan.',
        requirements: 'Co dien thoai va tai khoan ngan hang.',
        skills: ['Online sales'],
        salaryMin: 10_000_000,
        salaryMax: 50_000_000,
        experienceLevel: JobExperienceLevel.INTERN,
        workingType: JobWorkingType.REMOTE,
        employmentType: JobType.PART_TIME,
        location: 'Remote',
      },
      { companyTrustLevel: CompanyTrustLevel.MEDIUM },
    );

    expect(result.decision).toBe(JobModerationDecision.SHOULD_REJECT);
    expect(result.riskScore).toBe(100);
    expect(result.matchedRules).toContain('RISK_KEYWORD_APPLICATION_FEE');
    expect(result.matchedRules).toContain('REMOTE_JOB_WITH_UPFRONT_PAYMENT');
  });
});
