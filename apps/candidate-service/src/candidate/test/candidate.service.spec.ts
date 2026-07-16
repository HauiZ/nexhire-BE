import { ERROR_CODES, UserRole } from '@nexhire/shared';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { EventPublisher } from '@nexhire/infra';

import { CandidateService } from '../candidate.service';
import { CandidateCertification } from '../entities/candidate-certification.entity';
import { CandidateCv } from '../entities/candidate-cv.entity';
import { CandidateEducation } from '../entities/candidate-education.entity';
import { CandidateExperience } from '../entities/candidate-experience.entity';
import {
  CandidateDataSource,
  CandidateProfileVisibility,
  CandidateSkillLevel,
} from '../entities/candidate.enum';
import { CandidateProfile } from '../entities/candidate-profile.entity';
import { CandidateProject } from '../entities/candidate-project.entity';
import { CandidateSkill } from '../entities/candidate-skill.entity';
import { DocumentClientService } from '../../document-client/document-client.service';
import { AuthClientService } from '../auth-client.service';

type MockRepo<T> = {
  create: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
};

type MockManager = {
  create: jest.Mock;
  delete: jest.Mock;
  find: jest.Mock;
  findOneOrFail: jest.Mock;
  getRepository: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
};

function createRepoMock<T>(): MockRepo<T> {
  return {
    create: jest.fn((entity: T) => entity),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    save: jest.fn((entity: T) => Promise.resolve(entity)),
    update: jest.fn().mockResolvedValue(undefined),
  };
}

function createProfile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    id: 'candidate-1',
    userId: 'user-1',
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
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    skills: [],
    educations: [],
    experiences: [],
    certifications: [],
    projects: [],
    cvs: [],
    ...overrides,
  };
}

function createManager(profileRepo: MockRepo<CandidateProfile>): MockManager {
  return {
    create: jest.fn((_entity: unknown, payload: unknown) => payload),
    delete: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue([]),
    findOneOrFail: jest.fn().mockResolvedValue(createProfile()),
    getRepository: jest.fn(() => profileRepo),
    save: jest.fn((_entity: unknown, payload: unknown) => Promise.resolve(payload)),
    update: jest.fn().mockResolvedValue(undefined),
  };
}

describe('CandidateService', () => {
  let service: CandidateService;
  let dataSource: { transaction: jest.Mock };
  let profileRepo: MockRepo<CandidateProfile>;
  let skillRepo: MockRepo<CandidateSkill>;
  let educationRepo: MockRepo<CandidateEducation>;
  let experienceRepo: MockRepo<CandidateExperience>;
  let certificationRepo: MockRepo<CandidateCertification>;
  let projectRepo: MockRepo<CandidateProject>;
  let cvRepo: MockRepo<CandidateCv>;
  let documentClientService: { uploadCandidateDocument: jest.Mock };
  let authClientService: { getUserEmail: jest.Mock };
  let eventPublisher: { publish: jest.Mock };

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(),
    };
    profileRepo = createRepoMock<CandidateProfile>();
    skillRepo = createRepoMock<CandidateSkill>();
    educationRepo = createRepoMock<CandidateEducation>();
    experienceRepo = createRepoMock<CandidateExperience>();
    certificationRepo = createRepoMock<CandidateCertification>();
    projectRepo = createRepoMock<CandidateProject>();
    cvRepo = createRepoMock<CandidateCv>();
    documentClientService = {
      uploadCandidateDocument: jest.fn(),
    };
    authClientService = {
      getUserEmail: jest.fn().mockResolvedValue(null),
    };
    eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    service = new CandidateService(
      dataSource as unknown as DataSource,
      profileRepo as unknown as Repository<CandidateProfile>,
      skillRepo as unknown as Repository<CandidateSkill>,
      educationRepo as unknown as Repository<CandidateEducation>,
      experienceRepo as unknown as Repository<CandidateExperience>,
      certificationRepo as unknown as Repository<CandidateCertification>,
      projectRepo as unknown as Repository<CandidateProject>,
      cvRepo as unknown as Repository<CandidateCv>,
      documentClientService as unknown as DocumentClientService,
      authClientService as unknown as AuthClientService,
      eventPublisher as unknown as EventPublisher,
    );
  });

  it('lazy-creates an empty profile when the candidate profile does not exist', async () => {
    const createdProfile = createProfile();
    profileRepo.findOne.mockResolvedValue(null);
    profileRepo.create.mockReturnValue(createdProfile);
    profileRepo.save.mockResolvedValue(createdProfile);

    const result = await service.getMe('user-1');

    expect(profileRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        openToWork: true,
        visibility: CandidateProfileVisibility.PUBLIC,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        profile: expect.objectContaining({
          id: 'candidate-1',
          userId: 'user-1',
        }),
        skills: [],
        experiences: [],
        educations: [],
        certifications: [],
        projects: [],
        defaultCv: null,
        cvs: [],
        completionPercent: 0,
      }),
    );
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('falls back to login email when profile contact email is empty', async () => {
    profileRepo.findOne.mockResolvedValue(createProfile({ contactEmail: null }));
    authClientService.getUserEmail.mockResolvedValue('candidate@nexhire.vn');

    const result = await service.getMe('user-1');

    expect(authClientService.getUserEmail).toHaveBeenCalledWith('user-1');
    expect(result.profile.contactEmail).toBe('candidate@nexhire.vn');
    expect(result.completionPercent).toBe(8);
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('updates profile fields and replaces provided collections', async () => {
    const existingProfile = createProfile({ fullName: 'Old Name' });
    const updatedProfile = createProfile({
      fullName: 'Nguyen Minh Khoa',
      phone: '0912345678',
      contactEmail: 'khoa@example.com',
      headline: 'Senior Frontend Engineer',
      summary: 'Builds performant web products',
      location: 'Ha Noi',
      portfolioUrl: 'https://minhkhoa.dev',
    });
    const manager = createManager(profileRepo);
    profileRepo.findOne.mockResolvedValue(existingProfile);
    manager.findOneOrFail.mockResolvedValue(updatedProfile);
    dataSource.transaction.mockImplementation((callback: (manager: EntityManager) => unknown) =>
      callback(manager as unknown as EntityManager),
    );
    skillRepo.find.mockResolvedValue([
      {
        id: 'skill-1',
        candidateId: 'candidate-1',
        name: 'TypeScript',
        normalizedName: 'typescript',
        level: CandidateSkillLevel.ADVANCED,
        yearsOfExperience: 4,
        source: CandidateDataSource.MANUAL,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CandidateSkill,
    ]);
    experienceRepo.find.mockResolvedValue([
      {
        id: 'experience-1',
        candidateId: 'candidate-1',
        companyName: 'FPT Software',
        position: 'Senior Frontend Engineer',
        employmentType: null,
        startMonth: 3,
        startYear: 2022,
        endMonth: null,
        endYear: null,
        isCurrent: true,
        description: null,
        source: CandidateDataSource.MANUAL,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CandidateExperience,
    ]);
    educationRepo.find.mockResolvedValue([
      {
        id: 'education-1',
        candidateId: 'candidate-1',
        schoolName: 'HUST',
        degree: 'Engineer',
        fieldOfStudy: 'IT',
        startYear: 2015,
        endYear: 2019,
        isCurrent: false,
        description: null,
        source: CandidateDataSource.MANUAL,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CandidateEducation,
    ]);
    certificationRepo.find.mockResolvedValue([
      {
        id: 'certification-1',
        candidateId: 'candidate-1',
        name: 'AWS Certified Solutions Architect - Associate',
        issuer: 'Amazon Web Services',
        credentialUrl: 'https://www.credly.com/badges/example',
        issuedYear: 2025,
        description: null,
        source: CandidateDataSource.MANUAL,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CandidateCertification,
    ]);
    projectRepo.find.mockResolvedValue([
      {
        id: 'project-1',
        candidateId: 'candidate-1',
        name: 'NexHire ATS',
        description: 'Built candidate profile APIs',
        technologies: ['NestJS', 'PostgreSQL'],
        projectUrl: 'https://nexhire.example.com',
        source: CandidateDataSource.MANUAL,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CandidateProject,
    ]);

    const result = await service.updateMe('user-1', {
      profile: {
        fullName: ' Nguyen Minh Khoa ',
        phone: '0912345678',
        contactEmail: 'khoa@example.com',
        headline: 'Senior Frontend Engineer',
        summary: 'Builds performant web products',
        location: 'Ha Noi',
        portfolioUrl: 'https://minhkhoa.dev',
      },
      skills: [
        {
          name: ' TypeScript ',
          level: CandidateSkillLevel.ADVANCED,
          yearsOfExperience: 4,
        },
      ],
      experiences: [
        {
          companyName: 'FPT Software',
          position: 'Senior Frontend Engineer',
          startMonth: 3,
          startYear: 2022,
          isCurrent: true,
        },
      ],
      educations: [
        {
          schoolName: 'HUST',
          degree: 'Engineer',
          fieldOfStudy: 'IT',
          startYear: 2015,
          endYear: 2019,
        },
      ],
      certifications: [
        {
          name: 'AWS Certified Solutions Architect - Associate',
          issuer: 'Amazon Web Services',
          credentialUrl: 'https://www.credly.com/badges/example',
          issuedYear: 2025,
        },
      ],
      projects: [
        {
          name: 'NexHire ATS',
          description: 'Built candidate profile APIs',
          technologies: [' NestJS ', 'PostgreSQL', 'nestjs'],
          projectUrl: 'https://nexhire.example.com',
        },
      ],
    });

    expect(manager.update).toHaveBeenCalledWith(
      CandidateProfile,
      'candidate-1',
      expect.objectContaining({
        fullName: 'Nguyen Minh Khoa',
        contactEmail: 'khoa@example.com',
      }),
    );
    expect(manager.delete).toHaveBeenCalledWith(CandidateSkill, {
      candidateId: 'candidate-1',
    });
    expect(manager.delete).toHaveBeenCalledWith(CandidateExperience, {
      candidateId: 'candidate-1',
    });
    expect(manager.delete).toHaveBeenCalledWith(CandidateEducation, {
      candidateId: 'candidate-1',
    });
    expect(manager.delete).toHaveBeenCalledWith(CandidateCertification, {
      candidateId: 'candidate-1',
    });
    expect(manager.delete).toHaveBeenCalledWith(CandidateProject, {
      candidateId: 'candidate-1',
    });
    expect(manager.save).toHaveBeenCalledWith(
      CandidateSkill,
      expect.arrayContaining([
        expect.objectContaining({
          name: 'TypeScript',
          normalizedName: 'typescript',
        }),
      ]),
    );
    expect(manager.save).toHaveBeenCalledWith(
      CandidateProject,
      expect.arrayContaining([
        expect.objectContaining({
          name: 'NexHire ATS',
          technologies: ['NestJS', 'PostgreSQL'],
        }),
      ]),
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'candidate.profile-snapshot-changed',
      expect.objectContaining({
        candidateId: 'candidate-1',
        candidateUserId: 'user-1',
        fullName: 'Nguyen Minh Khoa',
        email: 'khoa@example.com',
        phone: '0912345678',
      }),
    );
    expect(result.completionPercent).toBe(100);
  });

  it('keeps omitted collections unchanged and deletes an explicitly empty section', async () => {
    const existingProfile = createProfile();
    const manager = createManager(profileRepo);
    profileRepo.findOne.mockResolvedValue(existingProfile);
    manager.findOneOrFail.mockResolvedValue(existingProfile);
    dataSource.transaction.mockImplementation((callback: (manager: EntityManager) => unknown) =>
      callback(manager as unknown as EntityManager),
    );

    await service.updateMe('user-1', {
      skills: [],
    });

    expect(manager.delete).toHaveBeenCalledWith(CandidateSkill, {
      candidateId: 'candidate-1',
    });
    expect(manager.delete).not.toHaveBeenCalledWith(CandidateEducation, {
      candidateId: 'candidate-1',
    });
    expect(manager.delete).not.toHaveBeenCalledWith(CandidateExperience, {
      candidateId: 'candidate-1',
    });
    expect(manager.delete).not.toHaveBeenCalledWith(CandidateCertification, {
      candidateId: 'candidate-1',
    });
    expect(manager.delete).not.toHaveBeenCalledWith(CandidateProject, {
      candidateId: 'candidate-1',
    });
  });

  it('rejects duplicate skills after normalization', async () => {
    const existingProfile = createProfile();
    const manager = createManager(profileRepo);
    profileRepo.findOne.mockResolvedValue(existingProfile);
    dataSource.transaction.mockImplementation((callback: (manager: EntityManager) => unknown) =>
      callback(manager as unknown as EntityManager),
    );

    await expect(
      service.updateMe('user-1', {
        skills: [{ name: 'Node.js' }, { name: ' node.js ' }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.CANDIDATE.DUPLICATE_SKILL,
      }),
    });
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('rejects invalid experience date precision', async () => {
    const existingProfile = createProfile();
    const manager = createManager(profileRepo);
    profileRepo.findOne.mockResolvedValue(existingProfile);
    dataSource.transaction.mockImplementation((callback: (manager: EntityManager) => unknown) =>
      callback(manager as unknown as EntityManager),
    );

    await expect(
      service.updateMe('user-1', {
        experiences: [
          {
            companyName: 'FPT Software',
            position: 'Frontend Engineer',
            startMonth: 3,
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.CANDIDATE.INVALID_EXPERIENCE_DATE_PRECISION,
      }),
    });
    expect(manager.delete).not.toHaveBeenCalledWith(CandidateExperience, {
      candidateId: 'candidate-1',
    });
  });

  it('rejects unsupported avatar file types', async () => {
    await expect(
      service.uploadAvatar(
        { id: 'user-1', role: UserRole.CANDIDATE },
        {
          originalname: 'avatar.pdf',
          mimetype: 'application/pdf',
          size: 100,
          buffer: Buffer.from('file'),
        },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.DOCUMENT.UNSUPPORTED_FILE_TYPE,
      }),
    });
    expect(documentClientService.uploadCandidateDocument).not.toHaveBeenCalled();
  });

  it('marks a candidate CV parse attempt as failed', async () => {
    const cv = {
      id: 'cv-1',
      candidateId: 'candidate-1',
      documentId: 'document-1',
      title: 'CV',
      isDefault: true,
      parseStatus: 'PARSING',
      parsedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    } as CandidateCv;
    cvRepo.findOne.mockResolvedValue(cv);

    const result = await service.markCvParseFailed('candidate-1', 'cv-1');

    expect(cvRepo.update).toHaveBeenCalledWith('cv-1', {
      parseStatus: 'FAILED',
      parsedAt: null,
    });
    expect(result.parseStatus).toBe('FAILED');
    expect(result.parsedAt).toBeNull();
  });

  it('returns candidate and CV snapshot for applications with email fallback', async () => {
    profileRepo.findOne.mockResolvedValue(createProfile({ contactEmail: null }));
    authClientService.getUserEmail.mockResolvedValue('candidate@nexhire.vn');
    cvRepo.findOne.mockResolvedValue({
      id: 'cv-1',
      candidateId: 'candidate-1',
      documentId: 'document-1',
      title: 'Main CV',
      isDefault: true,
      parseStatus: 'PARSED',
      parsedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as CandidateCv);

    const result = await service.getApplicationSnapshot('user-1', 'cv-1');

    expect(cvRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'cv-1', candidateId: 'candidate-1' },
    });
    expect(result).toEqual(
      expect.objectContaining({
        candidateId: 'candidate-1',
        candidateUserId: 'user-1',
        email: 'candidate@nexhire.vn',
        candidateCvId: 'cv-1',
        cvDocumentId: 'document-1',
        cvParseStatus: 'PARSED',
      }),
    );
  });

  it('rejects application snapshot when the CV does not belong to the candidate', async () => {
    profileRepo.findOne.mockResolvedValue(createProfile());
    cvRepo.findOne.mockResolvedValue(null);

    await expect(service.getApplicationSnapshot('user-1', 'missing-cv')).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({
        code: ERROR_CODES.APPLICATION.CV_NOT_FOUND,
      }),
    });
  });
});
