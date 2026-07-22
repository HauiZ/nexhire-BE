import { Injectable } from '@nestjs/common';

import {
  ParsedResume,
  ParsedResumeCertification,
  ParsedResumeEducation,
  ParsedResumeExperience,
  ParsedResumeProject,
  ParsedResumeSkill,
} from '@nexhire/shared';

@Injectable()
export class GeminiResumeNormalizerService {
  normalize(payload: unknown): ParsedResume {
    const root = this.asRecord(payload);
    const profile = this.asRecord(root.profile);

    return {
      profile: {
        fullName: this.pickString(profile.fullName),
        phone: this.pickString(profile.phone),
        contactEmail: this.pickString(profile.contactEmail),
        headline: this.pickString(profile.headline),
        summary: this.pickString(profile.summary),
        location: this.pickString(profile.location),
        portfolioUrl: this.pickString(profile.portfolioUrl),
        linkedinUrl: this.pickString(profile.linkedinUrl),
      },
      skills: this.uniqueSkills(this.array(root.skills).map((item) => this.normalizeSkill(item))),
      experiences: this.array(root.experiences).map((item) => this.normalizeExperience(item)),
      educations: this.array(root.educations).map((item) => this.normalizeEducation(item)),
      certifications: this.array(root.certifications).map((item) =>
        this.normalizeCertification(item),
      ),
      projects: this.array(root.projects).map((item) => this.normalizeProject(item)),
    };
  }

  private normalizeSkill(item: unknown): ParsedResumeSkill {
    if (typeof item === 'string') {
      return { name: item.trim() || 'Unknown skill' };
    }
    const record = this.asRecord(item);
    return {
      name: this.pickString(record.name) ?? 'Unknown skill',
      level: this.pickString(record.level),
      yearsOfExperience: this.pickNumber(record.yearsOfExperience),
    };
  }

  private normalizeExperience(item: unknown): ParsedResumeExperience {
    const record = this.asRecord(item);
    return {
      companyName: this.pickString(record.companyName) ?? 'Unknown company',
      position: this.pickString(record.position) ?? 'Unknown position',
      employmentType: this.pickString(record.employmentType),
      startMonth: this.pickMonth(record.startMonth),
      startYear: this.pickNumber(record.startYear),
      endMonth: this.pickMonth(record.endMonth),
      endYear: this.pickNumber(record.endYear),
      isCurrent: this.pickBoolean(record.isCurrent),
      description: this.pickString(record.description),
    };
  }

  private normalizeEducation(item: unknown): ParsedResumeEducation {
    const record = this.asRecord(item);
    return {
      schoolName: this.pickString(record.schoolName) ?? 'Unknown school',
      degree: this.pickString(record.degree),
      fieldOfStudy: this.pickString(record.fieldOfStudy),
      startYear: this.pickNumber(record.startYear),
      endYear: this.pickNumber(record.endYear),
      isCurrent: this.pickBoolean(record.isCurrent),
      description: this.pickString(record.description),
    };
  }

  private normalizeCertification(item: unknown): ParsedResumeCertification {
    const record = this.asRecord(item);
    return {
      name: this.pickString(record.name) ?? 'Unknown certification',
      issuer: this.pickString(record.issuer),
      credentialUrl: this.pickString(record.credentialUrl),
      issuedYear: this.pickNumber(record.issuedYear),
      description: this.pickString(record.description),
    };
  }

  private normalizeProject(item: unknown): ParsedResumeProject {
    const record = this.asRecord(item);
    return {
      name: this.pickString(record.name) ?? 'Untitled project',
      description: this.pickString(record.description),
      technologies: this.array(record.technologies)
        .map((technology) => this.pickString(technology))
        .filter((technology): technology is string => Boolean(technology)),
      projectUrl: this.pickString(record.projectUrl),
    };
  }

  private uniqueSkills(skills: ParsedResumeSkill[]): ParsedResumeSkill[] {
    const seen = new Set<string>();
    const result: ParsedResumeSkill[] = [];
    for (const skill of skills) {
      const key = skill.name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(skill);
      if (result.length >= 40) {
        break;
      }
    }
    return result;
  }

  private array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private pickString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private pickNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
    return undefined;
  }

  private pickMonth(value: unknown): number | undefined {
    const month = this.pickNumber(value);
    return month && month >= 1 && month <= 12 ? month : undefined;
  }

  private pickBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
