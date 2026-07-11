import { ERROR_CODES } from '@nexhire/shared';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { CandidateService } from '../candidate.service';
import { CandidateEducation } from '../entities/candidate-education.entity';
import { CandidateExperience } from '../entities/candidate-experience.entity';
import {
  CandidateDataSource,
  CandidateProfileVisibility,
  CandidateSkillLevel,
} from '../entities/candidate.enum';
import { CandidateProfile } from '../entities/candidate-profile.entity';
import { CandidateSkill } from '../entities/candidate-skill.entity';

type MockRepo<T> = {
  create: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
};

type MockManager = {
  create: jest.Mock;
  delete: jest.Mock;
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
    ...overrides,
  };
}

function createManager(profileRepo: MockRepo<CandidateProfile>): MockManager {
  return {
    create: jest.fn((_entity: unknown, payload: unknown) => payload),
    delete: jest.fn().mockResolvedValue(undefined),
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

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(),
    };
    profileRepo = createRepoMock<CandidateProfile>();
    skillRepo = createRepoMock<CandidateSkill>();
    educationRepo = createRepoMock<CandidateEducation>();
    experienceRepo = createRepoMock<CandidateExperience>();

    service = new CandidateService(
      dataSource as unknown as DataSource,
      profileRepo as unknown as Repository<CandidateProfile>,
      skillRepo as unknown as Repository<CandidateSkill>,
      educationRepo as unknown as Repository<CandidateEducation>,
      experienceRepo as unknown as Repository<CandidateExperience>,
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
        defaultCv: null,
        cvs: [],
        completionPercent: 0,
      }),
    );
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
    expect(manager.save).toHaveBeenCalledWith(
      CandidateSkill,
      expect.arrayContaining([
        expect.objectContaining({
          name: 'TypeScript',
          normalizedName: 'typescript',
        }),
      ]),
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
});
