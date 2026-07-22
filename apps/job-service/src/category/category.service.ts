import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REDIS_CLIENT } from '@nexhire/infra';
import { JobStatus } from '@nexhire/shared';
import { Redis } from 'ioredis';
import { Repository } from 'typeorm';
import { PublicCategoryDto } from './dto/category-response.dto';
import { JobCategory } from './entities/job-category.entity';
import { Job } from '../job/entities/job.entity';

const PUBLIC_CATEGORY_CACHE_TTL_SECONDS = 30;
const PUBLIC_CATEGORY_CACHE_KEY = 'job:public-categories';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectRepository(JobCategory)
    private readonly categoryRepo: Repository<JobCategory>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async listPublic(): Promise<PublicCategoryDto[]> {
    const cached = await this.getCachedPublicCategories();
    if (cached) {
      return cached;
    }

    const rows = await this.categoryRepo
      .createQueryBuilder('category')
      .leftJoin(
        Job,
        'job',
        'job.categoryId = category.id AND job.status = :status AND job.deletedAt IS NULL',
        { status: JobStatus.PUBLISHED },
      )
      .select('category.id', 'id')
      .addSelect('category.name', 'name')
      .addSelect('category.slug', 'slug')
      .addSelect('category.description', 'description')
      .addSelect('COUNT(job.id)', 'activeJobCount')
      .where('category.isActive = true')
      .groupBy('category.id')
      .addGroupBy('category.name')
      .addGroupBy('category.slug')
      .addGroupBy('category.description')
      .addGroupBy('category.sortOrder')
      .orderBy('COUNT(job.id)', 'DESC')
      .addOrderBy('category.sortOrder', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .getRawMany<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        activeJobCount: string;
      }>();

    const result = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      activeJobCount: Number(row.activeJobCount),
    }));
    await this.cachePublicCategories(result);
    return result;
  }

  private async getCachedPublicCategories(): Promise<PublicCategoryDto[] | null> {
    try {
      const cached = await this.redis.get(PUBLIC_CATEGORY_CACHE_KEY);
      return cached ? (JSON.parse(cached) as PublicCategoryDto[]) : null;
    } catch (error) {
      this.logger.warn(`Redis category cache read failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async cachePublicCategories(categories: PublicCategoryDto[]): Promise<void> {
    try {
      await this.redis.set(
        PUBLIC_CATEGORY_CACHE_KEY,
        JSON.stringify(categories),
        'EX',
        PUBLIC_CATEGORY_CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(`Redis category cache write failed: ${(error as Error).message}`);
    }
  }
}
