import { PublicJobQueryDto, RecruiterJobQueryDto } from '../dto/job-query.dto';
import { JobResponseDto, PublicJobListItemDto } from '../dto/job-response.dto';

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface JobSearchProvider {
  searchPublicJobs(query: PublicJobQueryDto): Promise<Paginated<PublicJobListItemDto>>;
  searchPublicCompanyJobs(
    companyId: string,
    query: PublicJobQueryDto,
  ): Promise<Paginated<PublicJobListItemDto>>;
  searchCompanyJobs(
    companyId: string,
    query: RecruiterJobQueryDto,
  ): Promise<Paginated<JobResponseDto>>;
}

export const JOB_SEARCH_PROVIDER = Symbol('JOB_SEARCH_PROVIDER');
