import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JobStatus } from '@nexhire/shared';
import { Repository } from 'typeorm';
import { PublicCategoryDto } from './dto/category-response.dto';
import { JobCategory } from './entities/job-category.entity';
import { Job } from '../job/entities/job.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(JobCategory)
    private readonly categoryRepo: Repository<JobCategory>,
  ) {}

  async listPublic(): Promise<PublicCategoryDto[]> {
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

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      activeJobCount: Number(row.activeJobCount),
    }));
  }
}
