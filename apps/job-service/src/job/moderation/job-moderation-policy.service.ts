import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AuthUser,
  ERROR_CODES,
  JobExperienceLevel,
  JobType,
  JobWorkingType,
} from '@nexhire/shared';
import { DataSource, Not, Repository } from 'typeorm';
import {
  CreateJobModerationPolicyDto,
  JobModerationPolicyQueryDto,
  JobModerationPolicyResponseDto,
  TestJobModerationPolicyDto,
  UpdateJobModerationPolicyDto,
} from '../dto/job-moderation-policy.dto';
import {
  JobModerationPolicy,
  JobModerationPolicyRules,
  JobModerationPolicyStatus,
} from '../entities/job-moderation-policy.entity';
import { CompanyTrustLevel } from '../entities/job.enum';
import {
  DEFAULT_JOB_MODERATION_POLICY_RULES,
  JobModerationInput,
  JobModerationService,
} from './job-moderation.service';

@Injectable()
export class JobModerationPolicyService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(JobModerationPolicy)
    private readonly policyRepo: Repository<JobModerationPolicy>,
    private readonly moderationService: JobModerationService,
  ) {}

  async list(query: JobModerationPolicyQueryDto): Promise<JobModerationPolicyResponseDto[]> {
    const policies = await this.policyRepo.find({
      where: query.status
        ? { status: query.status }
        : { status: Not(JobModerationPolicyStatus.ARCHIVED) },
      order: { status: 'ASC', updatedAt: 'DESC' },
    });
    return policies.map(JobModerationPolicyResponseDto.fromEntity);
  }

  async get(id: string): Promise<JobModerationPolicyResponseDto> {
    return JobModerationPolicyResponseDto.fromEntity(await this.findOrThrow(id));
  }

  getDefaultRules(): JobModerationPolicyRules {
    return DEFAULT_JOB_MODERATION_POLICY_RULES;
  }

  async create(
    admin: AuthUser,
    dto: CreateJobModerationPolicyDto,
  ): Promise<JobModerationPolicyResponseDto> {
    const policy = this.policyRepo.create({
      name: dto.name.trim(),
      status: JobModerationPolicyStatus.DRAFT,
      version: 1,
      rules: this.validateRules(dto.rules),
      createdByUserId: admin.id,
      updatedByUserId: admin.id,
    });
    return JobModerationPolicyResponseDto.fromEntity(await this.policyRepo.save(policy));
  }

  async update(
    admin: AuthUser,
    id: string,
    dto: UpdateJobModerationPolicyDto,
  ): Promise<JobModerationPolicyResponseDto> {
    const policy = await this.findOrThrow(id);
    if (policy.status === JobModerationPolicyStatus.ARCHIVED) {
      throw new ConflictException({
        code: ERROR_CODES.COMMON.CONFLICT,
        message: 'Archived moderation policies cannot be edited',
      });
    }
    if (policy.status === JobModerationPolicyStatus.ACTIVE && dto.rules !== undefined) {
      throw new ConflictException({
        code: ERROR_CODES.COMMON.CONFLICT,
        message:
          'Active moderation policy rules cannot be edited. Create a draft policy and publish it instead',
      });
    }
    if (dto.name !== undefined) {
      policy.name = dto.name.trim();
    }
    if (dto.rules !== undefined) {
      policy.rules = this.validateRules(dto.rules);
      policy.version += 1;
    }
    policy.updatedByUserId = admin.id;
    return JobModerationPolicyResponseDto.fromEntity(await this.policyRepo.save(policy));
  }

  async publish(admin: AuthUser, id: string): Promise<JobModerationPolicyResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(JobModerationPolicy);
      const policy = await repo.findOne({ where: { id } });
      if (!policy) {
        throw this.notFound();
      }
      if (policy.status === JobModerationPolicyStatus.ARCHIVED) {
        throw new ConflictException({
          code: ERROR_CODES.COMMON.CONFLICT,
          message: 'Archived moderation policies cannot be published. Create a new draft instead',
        });
      }
      if (policy.status === JobModerationPolicyStatus.ACTIVE) {
        return JobModerationPolicyResponseDto.fromEntity(policy);
      }
      policy.rules = this.validateRules(policy.rules);
      await repo.update(
        { status: JobModerationPolicyStatus.ACTIVE },
        { status: JobModerationPolicyStatus.UNPUBLISHED, updatedByUserId: admin.id },
      );
      policy.status = JobModerationPolicyStatus.ACTIVE;
      policy.updatedByUserId = admin.id;
      return JobModerationPolicyResponseDto.fromEntity(await repo.save(policy));
    });
  }

  async archive(admin: AuthUser, id: string): Promise<JobModerationPolicyResponseDto> {
    const policy = await this.findOrThrow(id);
    if (policy.status === JobModerationPolicyStatus.ARCHIVED) {
      return JobModerationPolicyResponseDto.fromEntity(policy);
    }
    if (policy.status === JobModerationPolicyStatus.ACTIVE) {
      throw new ConflictException({
        code: ERROR_CODES.COMMON.CONFLICT,
        message:
          'Active moderation policy cannot be archived directly. Publish another policy first',
      });
    }
    policy.status = JobModerationPolicyStatus.ARCHIVED;
    policy.updatedByUserId = admin.id;
    return JobModerationPolicyResponseDto.fromEntity(await this.policyRepo.save(policy));
  }

  async test(dto: TestJobModerationPolicyDto) {
    const job = dto.job as Partial<JobModerationInput>;
    const rules = dto.rules ? this.validateRules(dto.rules) : undefined;
    return this.moderationService.moderate(
      {
        title: String(job.title ?? ''),
        description: String(job.description ?? ''),
        requirements: String(job.requirements ?? ''),
        skills: Array.isArray(job.skills) ? job.skills.map(String) : [],
        benefits: job.benefits === undefined || job.benefits === null ? null : String(job.benefits),
        salaryMin: typeof job.salaryMin === 'number' ? job.salaryMin : null,
        salaryMax: typeof job.salaryMax === 'number' ? job.salaryMax : null,
        experienceLevel: (job.experienceLevel ?? JobExperienceLevel.JUNIOR) as JobExperienceLevel,
        workingType: (job.workingType ?? JobWorkingType.HYBRID) as JobWorkingType,
        employmentType: (job.employmentType ?? JobType.FULL_TIME) as JobType,
        location: String(job.location ?? ''),
      },
      {
        companyTrustLevel: dto.companyTrustLevel ?? CompanyTrustLevel.MEDIUM,
      },
      rules,
    );
  }

  private async findOrThrow(id: string): Promise<JobModerationPolicy> {
    const policy = await this.policyRepo.findOne({ where: { id } });
    if (!policy) {
      throw this.notFound();
    }
    return policy;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ERROR_CODES.JOB.MODERATION_POLICY_NOT_FOUND,
      message: 'Job moderation policy was not found',
    });
  }

  private validateRules(rules: JobModerationPolicyRules): JobModerationPolicyRules {
    if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
      throw this.invalidRules('Rules must be an object');
    }
    const thresholds = rules.thresholds;
    if (
      !thresholds ||
      !(thresholds.medium > 0) ||
      !(thresholds.high > thresholds.medium) ||
      !(thresholds.critical > thresholds.high) ||
      thresholds.critical > 100
    ) {
      throw this.invalidRules('Risk thresholds must satisfy 0 < medium < high < critical <= 100');
    }
    if (!Array.isArray(rules.keywordRules)) {
      throw this.invalidRules('keywordRules must be an array');
    }
    const normalizedKeywords = new Set<string>();
    if (
      !rules.contentRules ||
      !rules.salaryRules?.maxByExperienceLevel ||
      !rules.linkRules ||
      !rules.spamRules ||
      !rules.crossSignalRules ||
      !rules.companyTrustRules
    ) {
      throw this.invalidRules('Rules must include all moderation rule sections');
    }
    this.assertNumber(rules.contentRules.minDescriptionLength, 'contentRules.minDescriptionLength');
    this.assertNumber(rules.contentRules.descriptionScore, 'contentRules.descriptionScore');
    this.assertNumber(
      rules.contentRules.minRequirementsLength,
      'contentRules.minRequirementsLength',
    );
    this.assertNumber(rules.contentRules.requirementsScore, 'contentRules.requirementsScore');
    this.assertNumber(rules.contentRules.missingLocationScore, 'contentRules.missingLocationScore');

    this.assertStringArray(rules.linkRules.shortenedDomains, 'linkRules.shortenedDomains');
    this.assertNumber(rules.linkRules.shortenedUrlScore, 'linkRules.shortenedUrlScore');
    this.assertNumber(rules.linkRules.maxExternalLinks, 'linkRules.maxExternalLinks');
    this.assertNumber(
      rules.linkRules.tooManyExternalLinksScore,
      'linkRules.tooManyExternalLinksScore',
    );
    this.assertStringArray(rules.linkRules.externalFormDomains, 'linkRules.externalFormDomains');
    this.assertNumber(rules.linkRules.externalFormScore, 'linkRules.externalFormScore');

    this.assertNumber(rules.spamRules.allCapsTitleScore, 'spamRules.allCapsTitleScore');
    this.assertNumber(rules.spamRules.maxTitleSymbols, 'spamRules.maxTitleSymbols');
    this.assertNumber(rules.spamRules.excessiveSymbolsScore, 'spamRules.excessiveSymbolsScore');
    this.assertNumber(rules.spamRules.repeatedWordThreshold, 'spamRules.repeatedWordThreshold');
    this.assertNumber(rules.spamRules.repeatedWordScore, 'spamRules.repeatedWordScore');

    this.assertStringArray(
      rules.crossSignalRules.upfrontPaymentSignals,
      'crossSignalRules.upfrontPaymentSignals',
    );
    this.assertNumber(
      rules.crossSignalRules.remoteUpfrontPaymentScore,
      'crossSignalRules.remoteUpfrontPaymentScore',
    );
    this.assertNumber(
      rules.crossSignalRules.internshipNoExperienceSalaryMax,
      'crossSignalRules.internshipNoExperienceSalaryMax',
    );
    this.assertNumber(
      rules.crossSignalRules.internshipNoExperienceSalaryScore,
      'crossSignalRules.internshipNoExperienceSalaryScore',
    );

    this.assertNumber(rules.companyTrustRules.lowTrustScore, 'companyTrustRules.lowTrustScore');

    for (const rule of rules.keywordRules) {
      if (!rule.id?.trim() || !rule.keyword?.trim() || !(rule.score >= 0) || !rule.reason?.trim()) {
        throw this.invalidRules('Each keyword rule needs id, keyword, score, and reason');
      }
      const normalizedKeyword = this.normalizeText(rule.keyword);
      if (normalizedKeywords.has(normalizedKeyword)) {
        throw this.invalidRules(`Duplicate keyword rule keyword: ${rule.keyword}`);
      }
      normalizedKeywords.add(normalizedKeyword);
    }
    for (const level of Object.values(JobExperienceLevel)) {
      const salaryRule = rules.salaryRules.maxByExperienceLevel[level];
      if (!salaryRule || !(salaryRule.max >= 0) || !(salaryRule.score >= 0)) {
        throw this.invalidRules(
          `salaryRules.maxByExperienceLevel.${level} must include max and score`,
        );
      }
    }
    return rules;
  }

  private assertNumber(value: unknown, path: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw this.invalidRules(`${path} must be a number greater than or equal to 0`);
    }
  }

  private assertStringArray(value: unknown, path: string): void {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw this.invalidRules(`${path} must be an array of strings`);
    }
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  private invalidRules(message: string): BadRequestException {
    return new BadRequestException({
      code: ERROR_CODES.JOB.INVALID_MODERATION_POLICY,
      message,
    });
  }
}
