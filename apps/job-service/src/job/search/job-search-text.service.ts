import { Injectable } from '@nestjs/common';
import { UpdateJobDto } from '../dto/job-input.dto';
import { JobRevision } from '../entities/job-revision.entity';

@Injectable()
export class JobSearchTextService {
  buildSearchFields(
    job: Pick<
      UpdateJobDto | JobRevision,
      'title' | 'description' | 'requirements' | 'skills' | 'location'
    >,
    companyName: string | null,
  ) {
    const searchTitle = this.normalize(job.title);
    const searchDescription = this.normalize(job.description);
    const searchRequirements = this.normalize(job.requirements);
    const searchSkills = this.normalize(this.normalizeSkills(job.skills).join(' '));
    const searchCompanyName = this.normalize(companyName ?? '');
    const searchLocation = this.normalize(job.location);
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

  normalizeSkills(skills: string[]): string[] {
    return Array.from(
      new Set(skills.map((skill) => skill.trim()).filter((skill) => skill.length > 0)),
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
