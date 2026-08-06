import { Injectable } from '@nestjs/common';
import { UpdateJobDto } from '../dto/job-input.dto';
import { JobRevision } from '../entities/job-revision.entity';

@Injectable()
export class JobSearchTextService {
  private readonly genericQueryTerms = new Set([
    'cong',
    'job',
    'ky',
    'lam',
    'nang',
    'nghe',
    'tim',
    'tuyen',
    'viec',
  ]);

  buildSearchFields(
    job: Partial<Pick<
      UpdateJobDto | JobRevision,
      'title' | 'description' | 'requirements' | 'skills' | 'location'
    >>,
    companyName: string | null,
  ) {
    const searchTitle = this.normalize(job.title ?? '');
    const searchDescription = this.normalize(job.description ?? '');
    const searchRequirements = this.normalize(job.requirements ?? '');
    const searchSkills = this.normalize(this.normalizeSkills(job.skills).join(' '));
    const searchCompanyName = this.normalize(companyName ?? '');
    const searchLocation = this.normalize(job.location ?? '');
    return {
      searchTitle,
      searchDescription,
      searchRequirements,
      searchSkills,
      searchCompanyName,
      searchLocation,
      searchText: [
        searchTitle,
        searchDescription,
        searchRequirements,
        searchSkills,
        searchCompanyName,
        searchLocation,
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  normalizeSkills(skills: string[] | undefined | null): string[] {
    if (!skills || !Array.isArray(skills)) {
      return [];
    }
    return Array.from(
      new Set(skills.map((skill) => skill?.trim()).filter((skill) => skill && skill.length > 0)),
    );
  }

  parseSkillQuery(value: string | undefined): string[] {
    if (!value) {
      return [];
    }
    return value
      .split(',')
      .map((skill) => this.normalize(skill))
      .filter(Boolean);
  }

  buildTsQuery(value: string): string {
    return this.extractSearchTerms(value)
      .map((term) => `${term.replace(/'/g, "''")}:*`)
      .join(' | ');
  }

  extractSearchTerms(value: string): string[] {
    return Array.from(
      new Set(
        this.normalize(value)
          .split(' ')
          .map((term) => term.trim())
          .map((term) => term.replace(/[^a-z0-9]/g, ''))
          .filter((term) => term.length >= 2 && !this.genericQueryTerms.has(term)),
      ),
    );
  }

  normalize(value: string): string {
    return value
      .replace(/<[^>]*>/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111/g, 'd')
      .replace(/\u0110/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
