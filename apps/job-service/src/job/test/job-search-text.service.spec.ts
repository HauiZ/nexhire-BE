import { JobSearchTextService } from '../search/job-search-text.service';

describe('JobSearchTextService', () => {
  let service: JobSearchTextService;

  beforeEach(() => {
    service = new JobSearchTextService();
  });

  it('builds a relaxed tsquery from natural Vietnamese search text', () => {
    expect(service.buildTsQuery('kỹ năng Nestjs')).toBe('nestjs:*');
  });

  it('keeps meaningful terms as OR prefix matches', () => {
    expect(service.buildTsQuery('Backend NestJS PostgreSQL')).toBe(
      'backend:* | nestjs:* | postgresql:*',
    );
  });

  it('sanitizes technical punctuation before building tsquery', () => {
    expect(service.buildTsQuery('Node.js C# C++')).toBe('nodejs:*');
  });
});
