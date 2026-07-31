import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthUser, ERROR_CODES, ParsedResume } from '@nexhire/shared';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
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
import { CandidateCv } from './entities/candidate-cv.entity';
import { CandidateEducation } from './entities/candidate-education.entity';
import { CandidateExperience } from './entities/candidate-experience.entity';
import {
  CandidateDataSource,
  CandidateCvParseStatus,
  CandidateEmploymentType,
  CandidateProfileVisibility,
  CandidateSkillLevel,
} from './entities/candidate.enum';
import { CandidateProfile } from './entities/candidate-profile.entity';
import { CandidateProject } from './entities/candidate-project.entity';
import { CandidateSkill } from './entities/candidate-skill.entity';
import { CandidateCvResponseDto } from '../cv/dto/cv-response.dto';
import {
  CandidateApplicationSnapshotDto,
  CandidateMatchingSnapshotDto,
} from './dto/candidate-application-snapshot.dto';
import {
  CANDIDATE_AVATAR_MAX_UPLOAD_SIZE_BYTES,
  CANDIDATE_AVATAR_MIME_TYPES,
} from '../document-client/document-upload.constants';
import { DocumentClientService } from '../document-client/document-client.service';
import { CandidateUploadedFile } from '../document-client/interfaces/candidate-uploaded-file.interface';
import { AuthClientService } from './auth-client.service';
import { CandidateEventPublisher } from './events/candidate-event.publisher';

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
    @InjectRepository(CandidateCv)
    private readonly cvRepo: Repository<CandidateCv>,
    private readonly documentClientService: DocumentClientService,
    private readonly authClientService: AuthClientService,
    private readonly candidateEventPublisher: CandidateEventPublisher,
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

    const aggregate = await this.buildAggregate(profile);
    await this.publishProfileSnapshotChanged(profile);
    return aggregate;
  }

  async ensureProfileForUser(userId: string, manager?: EntityManager): Promise<CandidateProfile> {
    return this.ensureProfile(userId, manager);
  }

  async setAvatarDocument(
    userId: string,
    documentId: string,
  ): Promise<CandidateProfileResponseDto> {
    const profile = await this.ensureProfile(userId);
    await this.profileRepo.update(profile.id, { avatarDocumentId: documentId });
    const updatedProfile = await this.profileRepo.findOneOrFail({ where: { id: profile.id } });
    const aggregate = await this.buildAggregate(updatedProfile);
    await this.publishProfileSnapshotChanged(updatedProfile);
    return aggregate;
  }

  async uploadAvatar(
    user: AuthUser,
    file?: CandidateUploadedFile,
  ): Promise<CandidateProfileResponseDto> {
    if (!file) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_REQUIRED,
        message: 'Avatar file is required',
      });
    }
    this.assertUploadedFile(
      file,
      CANDIDATE_AVATAR_MIME_TYPES,
      CANDIDATE_AVATAR_MAX_UPLOAD_SIZE_BYTES,
    );

    const profile = await this.ensureProfile(user.id);
    const document = await this.documentClientService.uploadCandidateDocument(
      user,
      profile.id,
      'AVATAR',
      file,
    );
    return this.setAvatarDocument(user.id, document.id);
  }

  async applyParsedResume(
    candidateId: string,
    parsedResume: ParsedResume,
    candidateCvId?: string,
  ): Promise<CandidateProfileResponseDto> {
    const profile = await this.dataSource.transaction(async (manager) => {
      const currentProfile = await manager.findOneOrFail(CandidateProfile, {
        where: { id: candidateId },
      });

      await manager.update(
        CandidateProfile,
        currentProfile.id,
        this.buildProfilePatch({
          fullName: parsedResume.profile.fullName,
          phone: parsedResume.profile.phone,
          contactEmail: parsedResume.profile.contactEmail,
          headline: parsedResume.profile.headline,
          summary: parsedResume.profile.summary,
          location: parsedResume.profile.location,
          portfolioUrl: parsedResume.profile.portfolioUrl,
          linkedinUrl: parsedResume.profile.linkedinUrl,
        }),
      );

      await this.replaceSkills(
        manager,
        currentProfile.id,
        parsedResume.skills.map((skill) => ({
          name: skill.name,
          level: this.normalizeSkillLevel(skill.level),
          yearsOfExperience: skill.yearsOfExperience,
        })),
        CandidateDataSource.CV_PARSE,
      );
      await this.replaceEducations(
        manager,
        currentProfile.id,
        parsedResume.educations,
        CandidateDataSource.CV_PARSE,
      );
      await this.replaceExperiences(
        manager,
        currentProfile.id,
        parsedResume.experiences.map((experience) => ({
          ...experience,
          employmentType: this.normalizeEmploymentType(experience.employmentType),
        })),
        CandidateDataSource.CV_PARSE,
      );
      await this.replaceCertifications(
        manager,
        currentProfile.id,
        parsedResume.certifications,
        CandidateDataSource.CV_PARSE,
      );
      await this.replaceProjects(
        manager,
        currentProfile.id,
        parsedResume.projects,
        CandidateDataSource.CV_PARSE,
      );

      if (candidateCvId) {
        await manager.update(
          CandidateCv,
          { id: candidateCvId, candidateId: currentProfile.id },
          {
            parseStatus: CandidateCvParseStatus.PARSED,
            parsedAt: new Date(),
          },
        );
      }

      return manager.findOneOrFail(CandidateProfile, {
        where: { id: currentProfile.id },
      });
    });

    const aggregate = await this.buildAggregate(profile);
    await this.publishProfileSnapshotChanged(profile);
    return aggregate;
  }

  async markCvParseFailed(
    candidateId: string,
    candidateCvId: string,
    _errorMessage?: string,
  ): Promise<CandidateCvResponseDto> {
    const cv = await this.cvRepo.findOne({
      where: { id: candidateCvId, candidateId, deletedAt: IsNull() },
    });
    if (!cv) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.NOT_FOUND,
        message: 'Candidate CV not found',
      });
    }

    await this.cvRepo.update(candidateCvId, {
      parseStatus: CandidateCvParseStatus.FAILED,
      parsedAt: null,
    });
    return this.mapCv({
      ...cv,
      parseStatus: CandidateCvParseStatus.FAILED,
      parsedAt: null,
    });
  }

  async getApplicationSnapshot(
    userId: string,
    candidateCvId: string,
  ): Promise<CandidateApplicationSnapshotDto> {
    const profile = await this.ensureProfile(userId);
    const cv = await this.cvRepo.findOne({
      where: { id: candidateCvId, candidateId: profile.id, deletedAt: IsNull() },
    });
    if (!cv) {
      throw new BadRequestException({
        code: ERROR_CODES.APPLICATION.CV_NOT_FOUND,
        message: 'Candidate CV not found',
      });
    }

    return {
      candidateId: profile.id,
      candidateUserId: profile.userId,
      fullName: profile.fullName,
      email: await this.resolveContactEmail(profile),
      phone: profile.phone,
      avatarDocumentId: profile.avatarDocumentId,
      candidateCvId: cv.id,
      cvDocumentId: cv.documentId,
      cvTitle: cv.title,
      cvParseStatus: cv.parseStatus,
    };
  }

  async getMatchingSnapshot(
    candidateId: string,
    candidateCvId?: string,
  ): Promise<CandidateMatchingSnapshotDto> {
    const profile = await this.profileRepo.findOne({ where: { id: candidateId } });
    if (!profile) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.NOT_FOUND,
        message: 'Candidate profile not found',
      });
    }

    let cvId: string | null = null;
    if (candidateCvId) {
      const cv = await this.cvRepo.findOne({
        where: { id: candidateCvId, candidateId: profile.id, deletedAt: IsNull() },
      });
      if (!cv) {
        throw new BadRequestException({
          code: ERROR_CODES.APPLICATION.CV_NOT_FOUND,
          message: 'Candidate CV not found',
        });
      }
      cvId = cv.id;
    }

    const [skills, experiences, educations, certifications, projects] = await Promise.all([
      this.skillRepo.find({ where: { candidateId: profile.id }, order: { createdAt: 'ASC' } }),
      this.experienceRepo.find({
        where: { candidateId: profile.id },
        order: { startYear: 'DESC', startMonth: 'DESC', createdAt: 'ASC' },
      }),
      this.educationRepo.find({
        where: { candidateId: profile.id },
        order: { endYear: 'DESC', createdAt: 'ASC' },
      }),
      this.certificationRepo.find({
        where: { candidateId: profile.id },
        order: { issuedYear: 'DESC', createdAt: 'ASC' },
      }),
      this.projectRepo.find({ where: { candidateId: profile.id }, order: { createdAt: 'ASC' } }),
    ]);

    return {
      candidateId: profile.id,
      candidateUserId: profile.userId,
      candidateCvId: cvId,
      fullName: profile.fullName,
      headline: profile.headline,
      summary: profile.summary,
      location: profile.location,
      skills: skills.map((skill) => ({
        name: skill.name,
        level: skill.level,
        yearsOfExperience: skill.yearsOfExperience,
      })),
      experiences: experiences.map((experience) => ({
        title: experience.position,
        company: experience.companyName,
        startYear: experience.startYear,
        startMonth: experience.startMonth,
        endYear: experience.endYear,
        endMonth: experience.endMonth,
        isCurrent: experience.isCurrent,
      })),
      educations: educations.map((education) => ({
        degree: education.degree,
        school: education.schoolName,
        fieldOfStudy: education.fieldOfStudy,
      })),
      certifications: certifications.map((certification) => certification.name),
      projects: projects.map((project) => project.name),
    };
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
    const [skills, experiences, educations, certifications, projects, cvs] = await Promise.all([
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
      this.cvRepo.find({
        where: { candidateId: profile.id, deletedAt: IsNull() },
        order: { isDefault: 'DESC', createdAt: 'DESC' },
      }),
    ]);
    const cvResponses = cvs.map((cv) => this.mapCv(cv));
    const [contactEmail, avatarUrl] = await Promise.all([
      this.resolveContactEmail(profile),
      this.resolveAvatarUrl(profile.avatarDocumentId),
    ]);

    return {
      profile: this.mapProfile(profile, contactEmail, avatarUrl),
      skills: skills.map((skill) => this.mapSkill(skill)),
      experiences: experiences.map((experience) => this.mapExperience(experience)),
      educations: educations.map((education) => this.mapEducation(education)),
      certifications: certifications.map((certification) => this.mapCertification(certification)),
      projects: projects.map((project) => this.mapProject(project)),
      defaultCv: cvResponses.find((cv) => cv.isDefault) ?? null,
      cvs: cvResponses,
      completionPercent: this.calculateCompletionPercent(
        profile,
        contactEmail,
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
    source = CandidateDataSource.MANUAL,
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

    const writableSkills =
      source === CandidateDataSource.CV_PARSE
        ? await this.filterParsedSkillsAgainstManualSkills(manager, candidateId, skills)
        : skills;

    await this.deleteExistingSection(manager, CandidateSkill, candidateId, source);
    if (writableSkills.length === 0) {
      return;
    }

    await manager.save(
      CandidateSkill,
      writableSkills.map((skill) =>
        manager.create(CandidateSkill, {
          candidateId,
          name: skill.name.trim(),
          normalizedName: this.normalizeSkillName(skill.name),
          level: skill.level ?? null,
          yearsOfExperience: skill.yearsOfExperience ?? null,
          source,
        }),
      ),
    );
  }

  private async replaceEducations(
    manager: EntityManager,
    candidateId: string,
    educations: CandidateEducationInputDto[],
    source = CandidateDataSource.MANUAL,
  ): Promise<void> {
    educations.forEach((education) => this.assertEducationDateRange(education));
    await this.deleteExistingSection(manager, CandidateEducation, candidateId, source);
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
          endYear: education.endYear ?? null,
          isCurrent: education.isCurrent ?? false,
          description: this.nullableString(education.description),
          source,
        }),
      ),
    );
  }

  private async replaceExperiences(
    manager: EntityManager,
    candidateId: string,
    experiences: CandidateExperienceInputDto[],
    source = CandidateDataSource.MANUAL,
  ): Promise<void> {
    experiences.forEach((experience) => this.assertExperienceDateRange(experience));
    await this.deleteExistingSection(manager, CandidateExperience, candidateId, source);
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
          source,
        }),
      ),
    );
  }

  private async replaceCertifications(
    manager: EntityManager,
    candidateId: string,
    certifications: CandidateCertificationInputDto[],
    source = CandidateDataSource.MANUAL,
  ): Promise<void> {
    await this.deleteExistingSection(manager, CandidateCertification, candidateId, source);
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
          source,
        }),
      ),
    );
  }

  private async replaceProjects(
    manager: EntityManager,
    candidateId: string,
    projects: CandidateProjectInputDto[],
    source = CandidateDataSource.MANUAL,
  ): Promise<void> {
    await this.deleteExistingSection(manager, CandidateProject, candidateId, source);
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
          source,
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
    contactEmail: string | null,
    skills: CandidateSkill[],
    experiences: CandidateExperience[],
    educations: CandidateEducation[],
    certifications: CandidateCertification[],
    projects: CandidateProject[],
  ): number {
    const checks = [
      profile.fullName,
      profile.phone,
      contactEmail,
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

  private mapProfile(
    profile: CandidateProfile,
    contactEmail: string | null,
    avatarUrl: string | null,
  ): CandidateProfileFieldsResponseDto {
    return {
      id: profile.id,
      userId: profile.userId,
      fullName: profile.fullName,
      phone: profile.phone,
      contactEmail,
      avatarDocumentId: profile.avatarDocumentId,
      avatarUrl,
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

  private mapCv(cv: CandidateCv): CandidateCvResponseDto {
    return {
      id: cv.id,
      documentId: cv.documentId,
      title: cv.title,
      isDefault: cv.isDefault,
      parseStatus: cv.parseStatus,
      source: cv.source,
      sourceTemplateId: cv.sourceTemplateId,
      sourceCvId: cv.sourceCvId,
      parsedAt: cv.parsedAt,
      createdAt: cv.createdAt,
      updatedAt: cv.updatedAt,
    };
  }

  private nullableString(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async resolveContactEmail(profile: CandidateProfile): Promise<string | null> {
    if (profile.contactEmail?.trim()) {
      return profile.contactEmail;
    }
    return this.authClientService.getUserEmail(profile.userId);
  }

  private async resolveAvatarUrl(avatarDocumentId: string | null): Promise<string | null> {
    if (!avatarDocumentId) {
      return null;
    }

    try {
      const download = await this.documentClientService.createDownloadUrl(avatarDocumentId);
      return download.url;
    } catch {
      return null;
    }
  }

  private async publishProfileSnapshotChanged(profile: CandidateProfile): Promise<void> {
    await this.candidateEventPublisher.publishProfileSnapshotChanged({
      candidateId: profile.id,
      candidateUserId: profile.userId,
      fullName: profile.fullName,
      email: await this.resolveContactEmail(profile),
      phone: profile.phone,
      avatarDocumentId: profile.avatarDocumentId,
      changedAt: new Date().toISOString(),
    });
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

  private normalizeSkillLevel(value: string | undefined): CandidateSkillLevel | undefined {
    if (!value) {
      return undefined;
    }
    const normalized = value.trim().toUpperCase();
    return Object.values(CandidateSkillLevel).find((level) => level === normalized);
  }

  private normalizeEmploymentType(value: string | undefined): CandidateEmploymentType | undefined {
    if (!value) {
      return undefined;
    }
    const normalized = value
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    return Object.values(CandidateEmploymentType).find((type) => type === normalized);
  }

  private assertUploadedFile(
    file: CandidateUploadedFile,
    allowedMimeTypes: Set<string>,
    maxSizeBytes: number,
  ): void {
    if (!allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.UNSUPPORTED_FILE_TYPE,
        message: 'Unsupported file type',
      });
    }
    if (file.size > maxSizeBytes) {
      throw new BadRequestException({
        code: ERROR_CODES.DOCUMENT.FILE_TOO_LARGE,
        message: 'File is too large',
      });
    }
  }

  private async filterParsedSkillsAgainstManualSkills(
    manager: EntityManager,
    candidateId: string,
    skills: CandidateSkillInputDto[],
  ): Promise<CandidateSkillInputDto[]> {
    const manualSkills = await manager.find(CandidateSkill, {
      where: { candidateId, source: CandidateDataSource.MANUAL },
    });
    const manualSkillNames = new Set(
      manualSkills.map((skill) => this.normalizeSkillName(skill.name)),
    );
    return skills.filter((skill) => !manualSkillNames.has(this.normalizeSkillName(skill.name)));
  }

  private async deleteExistingSection<
    T extends { candidateId: string; source: CandidateDataSource },
  >(
    manager: EntityManager,
    entity: new () => T,
    candidateId: string,
    source: CandidateDataSource,
  ): Promise<void> {
    if (source === CandidateDataSource.CV_PARSE) {
      await manager.delete(entity, { candidateId, source });
      return;
    }
    await manager.delete(entity, { candidateId });
  }
}
