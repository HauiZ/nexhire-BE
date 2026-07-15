import { Injectable } from '@nestjs/common';

import {
  ParsedResume,
  ParsedResumeCertification,
  ParsedResumeEducation,
  ParsedResumeExperience,
  ParsedResumeProject,
  ParsedResumeSkill,
} from '@nexhire/shared';

import { SkimaResumePayload } from './skima-resume-parser.client';

@Injectable()
export class ResumeNormalizerService {
  normalize(payload: SkimaResumePayload): ParsedResume {
    const root =
      this.pickRecord(payload, ['resume', 'parsedResume', 'candidate', 'data']) ?? payload;

    return {
      profile: {
        fullName: this.pickString(root, ['fullName', 'name', 'candidateName']),
        phone: this.pickString(root, ['phone', 'phoneNumber', 'mobile']),
        contactEmail: this.pickString(root, ['email', 'contactEmail']),
        headline: this.pickString(root, ['headline', 'title', 'currentTitle']),
        summary: this.pickString(root, ['summary', 'profileSummary', 'objective']),
        location: this.pickString(root, ['location', 'address']),
        portfolioUrl: this.pickString(root, ['portfolioUrl', 'portfolio', 'website']),
        linkedinUrl: this.pickString(root, ['linkedinUrl', 'linkedin']),
      },
      skills: this.pickArray(root, ['skills', 'technicalSkills']).map((item) =>
        this.normalizeSkill(item),
      ),
      experiences: this.pickArray(root, ['experiences', 'experience', 'workExperience']).map(
        (item) => this.normalizeExperience(item),
      ),
      educations: this.pickArray(root, ['educations', 'education']).map((item) =>
        this.normalizeEducation(item),
      ),
      certifications: this.pickArray(root, ['certifications', 'certificates']).map((item) =>
        this.normalizeCertification(item),
      ),
      projects: this.pickArray(root, ['projects', 'personalProjects']).map((item) =>
        this.normalizeProject(item),
      ),
    };
  }

  private normalizeSkill(item: unknown): ParsedResumeSkill {
    if (typeof item === 'string') {
      return { name: item };
    }
    const record = this.asRecord(item);
    return {
      name: this.pickString(record, ['name', 'skill']) ?? 'Unknown skill',
      level: this.pickString(record, ['level', 'proficiency']),
      yearsOfExperience: this.pickNumber(record, ['yearsOfExperience', 'years']),
    };
  }

  private normalizeExperience(item: unknown): ParsedResumeExperience {
    const record = this.asRecord(item);
    return {
      companyName:
        this.pickString(record, ['companyName', 'company', 'organization']) ?? 'Unknown company',
      position: this.pickString(record, ['position', 'title', 'role']) ?? 'Unknown position',
      employmentType: this.pickString(record, ['employmentType', 'type']),
      startMonth: this.pickNumber(record, ['startMonth']),
      startYear: this.pickNumber(record, ['startYear']),
      endMonth: this.pickNumber(record, ['endMonth']),
      endYear: this.pickNumber(record, ['endYear']),
      isCurrent: this.pickBoolean(record, ['isCurrent', 'current']),
      description: this.pickString(record, ['description', 'summary']),
    };
  }

  private normalizeEducation(item: unknown): ParsedResumeEducation {
    const record = this.asRecord(item);
    return {
      schoolName:
        this.pickString(record, ['schoolName', 'school', 'institution']) ?? 'Unknown school',
      degree: this.pickString(record, ['degree']),
      fieldOfStudy: this.pickString(record, ['fieldOfStudy', 'major']),
      startYear: this.pickNumber(record, ['startYear']),
      endYear: this.pickNumber(record, ['endYear', 'graduationYear']),
      isCurrent: this.pickBoolean(record, ['isCurrent', 'current']),
      description: this.pickString(record, ['description']),
    };
  }

  private normalizeCertification(item: unknown): ParsedResumeCertification {
    const record = this.asRecord(item);
    return {
      name: this.pickString(record, ['name', 'certification', 'title']) ?? 'Unknown certification',
      issuer: this.pickString(record, ['issuer', 'organization']),
      credentialUrl: this.pickString(record, ['credentialUrl', 'url']),
      issuedYear: this.pickNumber(record, ['issuedYear', 'year']),
      description: this.pickString(record, ['description']),
    };
  }

  private normalizeProject(item: unknown): ParsedResumeProject {
    const record = this.asRecord(item);
    return {
      name: this.pickString(record, ['name', 'title']) ?? 'Untitled project',
      description: this.pickString(record, ['description', 'summary']),
      technologies: this.pickStringArray(record, ['technologies', 'techStack', 'skills']),
      projectUrl: this.pickString(record, ['projectUrl', 'url', 'link']),
    };
  }

  private pickRecord(
    record: Record<string, unknown>,
    keys: string[],
  ): Record<string, unknown> | undefined {
    for (const key of keys) {
      const value = record[key];
      if (this.isRecord(value)) {
        return value;
      }
    }
    return undefined;
  }

  private pickArray(record: Record<string, unknown>, keys: string[]): unknown[] {
    for (const key of keys) {
      const value = record[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
    return [];
  }

  private pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
        return Number(value);
      }
    }
    return undefined;
  }

  private pickBoolean(record: Record<string, unknown>, keys: string[]): boolean | undefined {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'boolean') {
        return value;
      }
    }
    return undefined;
  }

  private pickStringArray(record: Record<string, unknown>, keys: string[]): string[] | undefined {
    for (const key of keys) {
      const value = record[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
      }
    }
    return undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
