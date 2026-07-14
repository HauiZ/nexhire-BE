import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ERROR_CODES } from '@nexhire/shared';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  CandidateCertificationInputDto,
  CandidateEducationInputDto,
  CandidateExperienceInputDto,
  CandidateProjectInputDto,
  CandidateSkillInputDto,
  UpdateCandidateProfileDto,
  UpdateCandidateProfileFieldsDto,
} from './dto/update-candidate-profile.dto';
import {
  CandidateCertificationResponseDto,
  CandidateEducationResponseDto,
  CandidateExperienceResponseDto,
  CandidateProfileFieldsResponseDto,
  CandidateProfileResponseDto,
  CandidateProjectResponseDto,
  CandidateSkillResponseDto,
} from './dto/candidate-profile-response.dto';
import { CandidateCertification } from './entities/candidate-certification.entity';
import { CandidateEducation } from './entities/candidate-education.entity';
import { CandidateExperience } from './entities/candidate-experience.entity';
import { CandidateDataSource, CandidateProfileVisibility } from './entities/candidate.enum';
import { CandidateProfile } from './entities/candidate-profile.entity';
import { CandidateProject } from './entities/candidate-project.entity';
import { CandidateSkill } from './entities/candidate-skill.entity';

@Injectable()
export class CandidateService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CandidateProfile)
    private readonly profileRepo: Repository<CandidateProfile>,
    @InjectRepository(CandidateSkill)
    private readonly skillRepo: Repository<CandidateSkill>,
    @InjectRepository(CandidateEducation)
    private readonly educationRepo: Repository<CandidateEducation>,
    @InjectRepository(CandidateExperience)
    private readonly experienceRepo: Repository<CandidateExperience>,
    @InjectRepository(CandidateCertification)
    private readonly certificationRepo: Repository<CandidateCertification>,
    @InjectRepository(CandidateProject)
    private readonly projectRepo: Repository<CandidateProject>,
  ) {}

  async getMe(userId: string): Promise<CandidateProfileResponseDto> {
    const profile = await this.ensureProfile(userId);
    return this.buildAggregate(profile);
  }

  async updateMe(
    userId: string,
    dto: UpdateCandidateProfileDto,
  ): Promise<CandidateProfileResponseDto> {
    const profile = await this.dataSource.transaction(async (manager) => {
      const currentProfile = await this.ensureProfile(userId, manager);

      if (dto.profile) {
        await manager.update(
          CandidateProfile,
          currentProfile.id,
          this.buildProfilePatch(dto.profile),
        );
      }

      if (dto.skills !== undefined) {
        await this.replaceSkills(manager, currentProfile.id, dto.skills);
      }

      if (dto.educations !== undefined) {
        await this.replaceEducations(manager, currentProfile.id, dto.educations);
      }

      if (dto.experiences !== undefined) {
        await this.replaceExperiences(manager, currentProfile.id, dto.experiences);
      }

      if (dto.certifications !== undefined) {
        await this.replaceCertifications(manager, currentProfile.id, dto.certifications);
      }

      if (dto.projects !== undefined) {
        await this.replaceProjects(manager, currentProfile.id, dto.projects);
      }

      return manager.findOneOrFail(CandidateProfile, {
        where: { id: currentProfile.id },
      });
    });

    return this.buildAggregate(profile);
  }

  private async ensureProfile(userId: string, manager?: EntityManager): Promise<CandidateProfile> {
    const repo = manager?.getRepository(CandidateProfile) ?? this.profileRepo;
    const existing = await repo.findOne({ where: { userId } });
    if (existing) {
      return existing;
    }

    return repo.save(
      repo.create({
        userId,
        fullName: null,
        phone: null,
        contactEmail: null,
        avatarDocumentId: null,
        headline: null,
        summary: null,
        location: null,
        portfolioUrl: null,
        linkedinUrl: null,
        openToWork: true,
        visibility: CandidateProfileVisibility.PUBLIC,
        certifications: [],
        projects: [],
      }),
    );
  }

  private async buildAggregate(profile: CandidateProfile): Promise<CandidateProfileResponseDto> {
    const [skills, experiences, educations, certifications, projects] = await Promise.all([
      this.skillRepo.find({
        where: { candidateId: profile.id },
        order: { createdAt: 'ASC' },
      }),
      this.experienceRepo.find({
        where: { candidateId: profile.id },
        order: { startYear: 'DESC', startMonth: 'DESC', createdAt: 'ASC' },
      }),
      this.educationRepo.find({
        where: { candidateId: profile.id },
        order: { startYear: 'DESC', createdAt: 'ASC' },
      }),
      this.certificationRepo.find({
        where: { candidateId: profile.id },
        order: { issuedYear: 'DESC', createdAt: 'ASC' },
      }),
      this.projectRepo.find({
        where: { candidateId: profile.id },
        order: { createdAt: 'ASC' },
      }),
    ]);

    return {
      profile: this.mapProfile(profile),
      skills: skills.map((skill) => this.mapSkill(skill)),
      experiences: experiences.map((experience) => this.mapExperience(experience)),
      educations: educations.map((education) => this.mapEducation(education)),
      certifications: certifications.map((certification) => this.mapCertification(certification)),
      projects: projects.map((project) => this.mapProject(project)),
      defaultCv: null,
      cvs: [],
      completionPercent: this.calculateCompletionPercent(
        profile,
        skills,
        experiences,
        educations,
        certifications,
        projects,
      ),
    };
  }

  private buildProfilePatch(dto: UpdateCandidateProfileFieldsDto): Partial<CandidateProfile> {
    return {
      ...(dto.fullName !== undefined ? { fullName: this.nullableString(dto.fullName) } : {}),
      ...(dto.phone !== undefined ? { phone: this.nullableString(dto.phone) } : {}),
      ...(dto.contactEmail !== undefined
        ? { contactEmail: this.nullableString(dto.contactEmail) }
        : {}),
      ...(dto.headline !== undefined ? { headline: this.nullableString(dto.headline) } : {}),
      ...(dto.summary !== undefined ? { summary: this.nullableString(dto.summary) } : {}),
      ...(dto.location !== undefined ? { location: this.nullableString(dto.location) } : {}),
      ...(dto.portfolioUrl !== undefined
        ? { portfolioUrl: this.nullableString(dto.portfolioUrl) }
        : {}),
      ...(dto.linkedinUrl !== undefined
        ? { linkedinUrl: this.nullableString(dto.linkedinUrl) }
        : {}),
      ...(dto.openToWork !== undefined ? { openToWork: dto.openToWork } : {}),
      ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
      ...(dto.avatarDocumentId !== undefined
        ? { avatarDocumentId: this.nullableString(dto.avatarDocumentId) }
        : {}),
    };
  }

  private async replaceSkills(
    manager: EntityManager,
    candidateId: string,
    skills: CandidateSkillInputDto[],
  ): Promise<void> {
    const normalizedNames = new Set<string>();
    for (const skill of skills) {
      const normalizedName = this.normalizeSkillName(skill.name);
      if (normalizedNames.has(normalizedName)) {
        throw new ConflictException({
          code: ERROR_CODES.CANDIDATE.DUPLICATE_SKILL,
          message: `Duplicate skill: ${skill.name}`,
        });
      }
      normalizedNames.add(normalizedName);
    }

    await manager.delete(CandidateSkill, { candidateId });
    if (skills.length === 0) {
      return;
    }

    await manager.save(
      CandidateSkill,
      skills.map((skill) =>
        manager.create(CandidateSkill, {
          candidateId,
          name: skill.name.trim(),
          normalizedName: this.normalizeSkillName(skill.name),
          level: skill.level ?? null,
          yearsOfExperience: skill.yearsOfExperience ?? null,
          source: CandidateDataSource.MANUAL,
        }),
      ),
    );
  }

  private async replaceEducations(
    manager: EntityManager,
    candidateId: string,
    educations: CandidateEducationInputDto[],
  ): Promise<void> {
    educations.forEach((education) => this.assertEducationDateRange(education));
    await manager.delete(CandidateEducation, { candidateId });
    if (educations.length === 0) {
      return;
    }

    await manager.save(
      CandidateEducation,
      educations.map((education) =>
        manager.create(CandidateEducation, {
          candidateId,
          schoolName: education.schoolName.trim(),
          degree: this.nullableString(education.degree),
          fieldOfStudy: this.nullableString(education.fieldOfStudy),
          startYear: education.startYear ?? null,
          endYear: education.isCurrent ? null : (education.endYear ?? null),
          isCurrent: education.isCurrent ?? false,
          description: this.nullableString(education.description),
          source: CandidateDataSource.MANUAL,
        }),
      ),
    );
  }

  private async replaceExperiences(
    manager: EntityManager,
    candidateId: string,
    experiences: CandidateExperienceInputDto[],
  ): Promise<void> {
    experiences.forEach((experience) => this.assertExperienceDateRange(experience));
    await manager.delete(CandidateExperience, { candidateId });
    if (experiences.length === 0) {
      return;
    }

    await manager.save(
      CandidateExperience,
      experiences.map((experience) =>
        manager.create(CandidateExperience, {
          candidateId,
          companyName: experience.companyName.trim(),
          position: experience.position.trim(),
          employmentType: experience.employmentType ?? null,
          startMonth: experience.startMonth ?? null,
          startYear: experience.startYear ?? null,
          endMonth: experience.isCurrent ? null : (experience.endMonth ?? null),
          endYear: experience.isCurrent ? null : (experience.endYear ?? null),
          isCurrent: experience.isCurrent ?? false,
          description: this.nullableString(experience.description),
          source: CandidateDataSource.MANUAL,
        }),
      ),
    );
  }

  private async replaceCertifications(
    manager: EntityManager,
    candidateId: string,
    certifications: CandidateCertificationInputDto[],
  ): Promise<void> {
    await manager.delete(CandidateCertification, { candidateId });
    if (certifications.length === 0) {
      return;
    }

    await manager.save(
      CandidateCertification,
      certifications.map((certification) =>
        manager.create(CandidateCertification, {
          candidateId,
          name: certification.name.trim(),
          issuer: this.nullableString(certification.issuer),
          credentialUrl: this.nullableString(certification.credentialUrl),
          issuedYear: certification.issuedYear ?? null,
          description: this.nullableString(certification.description),
          source: CandidateDataSource.MANUAL,
        }),
      ),
    );
  }

  private async replaceProjects(
    manager: EntityManager,
    candidateId: string,
    projects: CandidateProjectInputDto[],
  ): Promise<void> {
    await manager.delete(CandidateProject, { candidateId });
    if (projects.length === 0) {
      return;
    }

    await manager.save(
      CandidateProject,
      projects.map((project) =>
        manager.create(CandidateProject, {
          candidateId,
          name: project.name.trim(),
          description: this.nullableString(project.description),
          technologies: this.normalizeTechnologies(project.technologies ?? []),
          projectUrl: this.nullableString(project.projectUrl),
          source: CandidateDataSource.MANUAL,
        }),
      ),
    );
  }

  private assertEducationDateRange(education: CandidateEducationInputDto): void {
    if (education.isCurrent) {
      return;
    }

    if (
      education.startYear !== undefined &&
      education.endYear !== undefined &&
      education.endYear < education.startYear
    ) {
      throw new BadRequestException({
        code: ERROR_CODES.CANDIDATE.INVALID_EDUCATION_DATE_RANGE,
        message: 'Education end year must be greater than or equal to start year',
      });
    }
  }

  private assertExperienceDateRange(experience: CandidateExperienceInputDto): void {
    if (experience.isCurrent) {
      return;
    }

    if (
      (experience.startMonth !== undefined && experience.startYear === undefined) ||
      (experience.endMonth !== undefined && experience.endYear === undefined)
    ) {
      throw new BadRequestException({
        code: ERROR_CODES.CANDIDATE.INVALID_EXPERIENCE_DATE_PRECISION,
        message: 'Experience month requires a matching year',
      });
    }

    if (experience.startYear === undefined || experience.endYear === undefined) {
      return;
    }

    const startMonth = experience.startMonth ?? 1;
    const endMonth = experience.endMonth ?? 12;
    const startValue = experience.startYear * 12 + startMonth;
    const endValue = experience.endYear * 12 + endMonth;
    if (endValue < startValue) {
      throw new BadRequestException({
        code: ERROR_CODES.CANDIDATE.INVALID_EXPERIENCE_DATE_RANGE,
        message: 'Experience end date must be greater than or equal to start date',
      });
    }
  }

  private calculateCompletionPercent(
    profile: CandidateProfile,
    skills: CandidateSkill[],
    experiences: CandidateExperience[],
    educations: CandidateEducation[],
    certifications: CandidateCertification[],
    projects: CandidateProject[],
  ): number {
    const checks = [
      profile.fullName,
      profile.phone,
      profile.contactEmail,
      profile.headline,
      profile.summary,
      profile.location,
      profile.portfolioUrl || profile.linkedinUrl,
      skills.length > 0,
      experiences.length > 0,
      educations.length > 0,
      certifications.length > 0,
      projects.length > 0,
    ];
    const completed = checks.filter((value) => Boolean(value)).length;
    return Math.round((completed / checks.length) * 100);
  }

  private mapProfile(profile: CandidateProfile): CandidateProfileFieldsResponseDto {
    return {
      id: profile.id,
      userId: profile.userId,
      fullName: profile.fullName,
      phone: profile.phone,
      contactEmail: profile.contactEmail,
      avatarDocumentId: profile.avatarDocumentId,
      headline: profile.headline,
      summary: profile.summary,
      location: profile.location,
      portfolioUrl: profile.portfolioUrl,
      linkedinUrl: profile.linkedinUrl,
      openToWork: profile.openToWork,
      visibility: profile.visibility,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  private mapSkill(skill: CandidateSkill): CandidateSkillResponseDto {
    return {
      id: skill.id,
      name: skill.name,
      level: skill.level,
      yearsOfExperience: skill.yearsOfExperience,
      source: skill.source,
    };
  }

  private mapExperience(experience: CandidateExperience): CandidateExperienceResponseDto {
    return {
      id: experience.id,
      companyName: experience.companyName,
      position: experience.position,
      employmentType: experience.employmentType,
      startMonth: experience.startMonth,
      startYear: experience.startYear,
      endMonth: experience.endMonth,
      endYear: experience.endYear,
      isCurrent: experience.isCurrent,
      description: experience.description,
      source: experience.source,
    };
  }

  private mapEducation(education: CandidateEducation): CandidateEducationResponseDto {
    return {
      id: education.id,
      schoolName: education.schoolName,
      degree: education.degree,
      fieldOfStudy: education.fieldOfStudy,
      startYear: education.startYear,
      endYear: education.endYear,
      isCurrent: education.isCurrent,
      description: education.description,
      source: education.source,
    };
  }

  private mapCertification(
    certification: CandidateCertification,
  ): CandidateCertificationResponseDto {
    return {
      id: certification.id,
      name: certification.name,
      issuer: certification.issuer,
      credentialUrl: certification.credentialUrl,
      issuedYear: certification.issuedYear,
      description: certification.description,
      source: certification.source,
    };
  }

  private mapProject(project: CandidateProject): CandidateProjectResponseDto {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      technologies: project.technologies,
      projectUrl: project.projectUrl,
      source: project.source,
    };
  }

  private nullableString(value: string | undefined): string | null {
    if (value === undefined) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeSkillName(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private normalizeTechnologies(values: string[]): string[] {
    const seen = new Set<string>();
    const technologies: string[] = [];
    for (const value of values) {
      const normalized = value.trim().replace(/\s+/g, ' ');
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) {
        continue;
      }
      seen.add(key);
      technologies.push(normalized);
    }
    return technologies;
  }
}
