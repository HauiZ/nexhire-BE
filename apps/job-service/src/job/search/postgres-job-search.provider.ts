import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JobStatus } from '@nexhire/shared';
import { Brackets, Repository } from 'typeorm';
import { JobSearchSort, PublicJobQueryDto, RecruiterJobQueryDto } from '../dto/job-query.dto';
import { JobResponseDto, PublicJobListItemDto } from '../dto/job-response.dto';
import { Job } from '../entities/job.entity';
import { JobSearchProvider, Paginated } from './job-search.types';
import { JobSearchTextService } from './job-search-text.service';

@Injectable()
export class PostgresJobSearchProvider implements JobSearchProvider {
  constructor(
    private readonly searchTextService: JobSearchTextService,
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
  ) {}

  async searchPublicJobs(query: PublicJobQueryDto): Promise<Paginated<PublicJobListItemDto>> {
    const qb = this.jobRepo
      .createQueryBuilder('job')
      .where('job.status = :status', { status: JobStatus.PUBLISHED })
      .skip(query.skip)
      .take(query.limit);

    this.applyPublicFilters(qb, query);
    this.applyJobSort(qb, query);

    const [jobs, total] = await qb.getManyAndCount();
    return this.paginate(
      jobs.map((job) => this.mapPublicJob(job)),
      query.page,
      query.limit,
      total,
    );
  }

  async searchPublicCompanyJobs(
    companyId: string,
    query: PublicJobQueryDto,
  ): Promise<Paginated<PublicJobListItemDto>> {
    const qb = this.jobRepo
      .createQueryBuilder('job')
      .where('job.status = :status', { status: JobStatus.PUBLISHED })
      .andWhere('job.companyId = :companyId', { companyId })
      .skip(query.skip)
      .take(query.limit);

    this.applyPublicFilters(qb, query);
    this.applyJobSort(qb, query);

    const [jobs, total] = await qb.getManyAndCount();
    return this.paginate(
      jobs.map((job) => this.mapPublicJob(job)),
      query.page,
      query.limit,
      total,
    );
  }

  async searchCompanyJobs(
    companyId: string,
    query: RecruiterJobQueryDto,
  ): Promise<Paginated<JobResponseDto>> {
    const qb = this.jobRepo
      .createQueryBuilder('job')
      .where('job.companyId = :companyId', { companyId })
      .skip(query.skip)
      .take(query.limit);

    if (query.status) {
      qb.andWhere('job.status = :status', { status: query.status });
    }
    this.applyPublicFilters(qb, query);
    this.applyJobSort(qb, query);

    const [jobs, total] = await qb.getManyAndCount();
    return this.paginate(
      jobs.map((job) => this.mapCompanyJob(job)),
      query.page,
      query.limit,
      total,
    );
  }

  private applyPublicFilters(
    qb: ReturnType<Repository<Job>['createQueryBuilder']>,
    query: PublicJobQueryDto | RecruiterJobQueryDto,
  ): void {
    const normalizedQuery = this.searchTextService.normalize(query.q ?? query.search ?? '');
    if (normalizedQuery) {
      qb.andWhere('job.search_vector @@ plainto_tsquery(:searchConfig, :searchQuery)', {
        searchConfig: 'simple',
        searchQuery: normalizedQuery,
      }).addSelect(
        'ts_rank_cd(job.search_vector, plainto_tsquery(:searchConfig, :searchQuery))',
        'search_rank',
      );
    }
    const skillTerms = this.parseSkillQuery(query.skills);
    if (skillTerms.length > 0) {
      const skillParams: Record<string, string> = {};
      qb.andWhere(
        new Brackets((where) => {
          for (const [index, skill] of skillTerms.entries()) {
            const paramName = `skill${index}`;
            skillParams[paramName] = `%${skill}%`;
            const condition = `job.searchSkills ILIKE :${paramName}`;
            if (index === 0) {
              where.where(condition);
            } else {
              where.orWhere(condition);
            }
          }
        }),
      )
        .addSelect(
          `(${skillTerms
            .map((_, index) => `CASE WHEN job.searchSkills ILIKE :skill${index} THEN 1 ELSE 0 END`)
            .join(' + ')})`,
          'skill_match_count',
        )
        .setParameters(skillParams);
    }
    if (query.location) {
      qb.andWhere('job.searchLocation ILIKE :location', {
        location: `%${this.searchTextService.normalize(query.location)}%`,
      });
    }
    if (query.employmentType) {
      qb.andWhere('job.employmentType = :employmentType', { employmentType: query.employmentType });
    }
    if (query.workingType) {
      qb.andWhere('job.workingType = :workingType', { workingType: query.workingType });
    }
    if (query.experienceLevel) {
      qb.andWhere('job.experienceLevel = :experienceLevel', {
        experienceLevel: query.experienceLevel,
      });
    }
    if (query.categoryId) {
      qb.andWhere('job.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (query.salaryMin !== undefined) {
      qb.andWhere('job.isSalaryVisible = true').andWhere('job.salaryMax >= :salaryMin', {
        salaryMin: query.salaryMin,
      });
    }
    if (query.salaryMax !== undefined) {
      qb.andWhere('job.isSalaryVisible = true').andWhere('job.salaryMin <= :salaryMax', {
        salaryMax: query.salaryMax,
      });
    }
  }

  private applyJobSort(
    qb: ReturnType<Repository<Job>['createQueryBuilder']>,
    query: PublicJobQueryDto | RecruiterJobQueryDto,
  ): void {
    const normalizedQuery = this.searchTextService.normalize(query.q ?? query.search ?? '');
    const sort = query.sort ?? (normalizedQuery ? JobSearchSort.RELEVANCE : JobSearchSort.LATEST);
    const hasSkillFilter = this.parseSkillQuery(query.skills).length > 0;
    const orderBySkillMatch = (): boolean => {
      if (!hasSkillFilter) {
        return false;
      }
      qb.orderBy('skill_match_count', 'DESC');
      return true;
    };
    const addOrSetOrder = (
      expression: string,
      direction: 'ASC' | 'DESC',
      nulls?: 'NULLS FIRST' | 'NULLS LAST',
    ) => {
      if (hasSkillFilter) {
        qb.addOrderBy(expression, direction, nulls);
      } else {
        qb.orderBy(expression, direction, nulls);
      }
    };

    if (sort === JobSearchSort.RELEVANCE && normalizedQuery) {
      orderBySkillMatch();
      addOrSetOrder('search_rank', 'DESC');
      qb.addOrderBy('job.publishedAt', 'DESC');
      return;
    }
    if (sort === JobSearchSort.DEADLINE_ASC) {
      orderBySkillMatch();
      addOrSetOrder('job.deadline', 'ASC', 'NULLS LAST');
      qb.addOrderBy('job.publishedAt', 'DESC');
      return;
    }
    if (sort === JobSearchSort.SALARY_DESC) {
      orderBySkillMatch();
      addOrSetOrder(
        'CASE WHEN job.isSalaryVisible = true THEN job.salaryMax ELSE NULL END',
        'DESC',
        'NULLS LAST',
      );
      qb.addOrderBy('job.publishedAt', 'DESC');
      return;
    }
    if (sort === JobSearchSort.SALARY_ASC) {
      orderBySkillMatch();
      addOrSetOrder(
        'CASE WHEN job.isSalaryVisible = true THEN job.salaryMin ELSE NULL END',
        'ASC',
        'NULLS LAST',
      );
      qb.addOrderBy('job.publishedAt', 'DESC');
      return;
    }
    orderBySkillMatch();
    addOrSetOrder('job.publishedAt', 'DESC');
    qb.addOrderBy('job.createdAt', 'DESC');
  }

  private parseSkillQuery(value: string | undefined): string[] {
    return this.searchTextService.parseSkillQuery(value);
  }

  private paginate<T>(data: T[], page: number, limit: number, total: number): Paginated<T> {
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private mapPublicJob(job: Job): PublicJobListItemDto {
    return {
      id: job.id,
      title: job.title,
      companyId: job.companyId,
      companyName: job.companyName,
      companyLogoUrl: job.companyLogoUrl,
      companyLogoDocumentId: job.companyLogoDocumentId,
      experienceLevel: job.experienceLevel,
      location: job.location,
      salaryMin: job.isSalaryVisible ? job.salaryMin : null,
      salaryMax: job.isSalaryVisible ? job.salaryMax : null,
      salaryCurrency: job.salaryCurrency,
      isSalaryVisible: job.isSalaryVisible,
      publishedAt: job.publishedAt,
    };
  }

  private mapCompanyJob(job: Job): JobResponseDto {
    return {
      id: job.id,
      companyId: job.companyId,
      companyName: job.companyName,
      companyLogoUrl: job.companyLogoUrl,
      companyLogoDocumentId: job.companyLogoDocumentId,
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      skills: job.skills,
      benefits: job.benefits,
      categoryId: job.categoryId,
      employmentType: job.employmentType,
      workingType: job.workingType,
      experienceLevel: job.experienceLevel,
      location: job.location,
      salaryMin: job.isSalaryVisible ? job.salaryMin : null,
      salaryMax: job.isSalaryVisible ? job.salaryMax : null,
      salaryCurrency: job.salaryCurrency,
      isSalaryVisible: job.isSalaryVisible,
      deadline: job.deadline,
      numberOfOpenings: job.numberOfOpenings,
      status: job.status,
      version: job.version,
      applicationCount: job.applicationCount,
      publishedAt: job.publishedAt,
      closedAt: job.closedAt,
      reviewedAt: job.reviewedAt,
      reviewReason: job.reviewReason,
      unpublishedAt: job.unpublishedAt,
      unpublishReason: job.unpublishReason,
      moderation: {
        riskScore: job.riskScore,
        riskLevel: job.riskLevel,
        decision: job.moderationDecision,
        reasons: job.moderationReasons,
        matchedRules: job.moderationMatchedRules,
      },
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
