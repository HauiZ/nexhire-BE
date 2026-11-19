import { ERROR_CODES, UserLanguage, UserRole } from '@nexhire/shared';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { CandidateService } from '../candidate.service';
import { CandidateCertification } from '../entities/candidate-certification.entity';
import { CandidateCv } from '../entities/candidate-cv.entity';
import { CandidateEducation } from '../entities/candidate-education.entity';
import { CandidateExperience } from '../entities/candidate-experience.entity';
import {
  CandidateDataSource,
  CandidateCvParseStatus,
  CandidateProfileVisibility,
  CandidateSkillLevel,
} from '../entities/candidate.enum';
import { CandidateProfile } from '../entities/candidate-profile.entity';
import { CandidateProject } from '../entities/candidate-project.entity';
import { CandidateSkill } from '../entities/candidate-skill.entity';
import { DocumentClientService } from '../../document-client/document-client.service';
import { AuthClientService } from '../auth-client.service';
import { CandidateEventPublisher } from '../events/candidate-event.publisher';
import { JobRecommendationsService } from '../job-recommendations.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { randomUUID } from 'crypto';

describe('Candidate job recommendations', () => {
  const user = { id: randomUUID(), role: UserRole.CANDIDATE },
    candidateId = randomUUID(),
    cvId = randomUUID(),
    documentId = randomUUID(),
    parseId = randomUUID();
  const profiles = { findOne: jest.fn() },
    cvs = { findOne: jest.fn() },
    http = { get: jest.fn(), post: jest.fn() };
  const config = {
    get: jest.fn(),
  };
  const service = new JobRecommendationsService(
    profiles as never,
    cvs as never,
    http as unknown as HttpService,
    config as unknown as ConfigService,
  );
  let payload: Record<string, unknown>;
  let parsed: {
    id: string;
    candidateId: string;
    candidateCvId: string;
    documentId: string;
    normalizedPayload: unknown;
  };
  let jobs: ReturnType<typeof job>[];
  let changedVisibility: boolean;
  let semanticEnabled: boolean;
  const cv = {
    id: cvId,
    candidateId,
    documentId,
    deletedAt: null,
    documentDeletedAt: null,
    parseStatus: CandidateCvParseStatus.PARSED,
    parsedAt: new Date('2026-11-18T00:00:00Z'),
  };
  const job = (title: string, skills: string[], id = randomUUID()) => ({
    id,
    title,
    companyName: 'Synthetic company',
    location: null,
    workingType: 'REMOTE',
    experienceLevel: 'JUNIOR',
    publishedAt: '2026-11-17T00:00:00Z',
    description: '',
    requirements: '',
    skills,
  });
  const recommend = () => service.recommend(user, cvId, { limit: 10 });
  const replySemantic = (body: object) =>
    http.post.mockReturnValue(
      of({ data: { success: true, data: { modelVersion: 'local-m1', ...body } } }),
    );
  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockImplementation(
      (key: string) =>
        ({
          'candidateService.internalServiceToken': 'synthetic-test-token',
          'candidateService.services.cvParsingService': 'http://parser-fixture',
          'candidateService.services.jobService': 'http://job-fixture',
          'candidateService.services.matchingService': 'http://matching-fixture',
          'candidateService.recommendations.semanticEnabled': semanticEnabled,
        })[key],
    );
    changedVisibility = false;
    semanticEnabled = false;
    payload = {
      profile: { fullName: 'Secret Name', contactEmail: 'secret@example.invalid', headline: '' },
      skills: [{ name: 'Python' }, { name: 'SQL' }],
      experiences: [],
      educations: [],
      certifications: [],
      projects: [],
    };
    parsed = {
      id: parseId,
      candidateId,
      candidateCvId: cvId,
      documentId,
      normalizedPayload: payload,
    };
    jobs = [
      job('Python SQL developer', ['Python', 'SQL']),
      job('Java developer', ['Java']),
      job('Python developer', ['Python']),
    ];
    profiles.findOne.mockResolvedValue({ id: candidateId });
    cvs.findOne.mockImplementation(async () => ({ ...cv }));
    http.get.mockImplementation((url: string, options: { params?: { ids?: string } }) =>
      of({
        data: {
          success: true,
          data: url.endsWith('/latest-result')
            ? parsed
            : {
                schemaVersion: 'public-recommendation-pool-v1',
                limit: 100,
                truncated: false,
                items: options.params?.ids
                  ? changedVisibility
                    ? []
                    : jobs.filter((item) => options.params!.ids!.split(',').includes(item.id))
                  : jobs,
              },
        },
      }),
    );
  });
  it('ranks multiple public jobs by the selected saved CV, with stable keyword scores and safe source explanations', async () => {
    const result = await recommend();
    if (result.method !== 'KEYWORD_OVERLAP_V1') throw new Error('Expected keyword baseline');
    expect(result.items.map((item) => item.job.id)).toEqual([jobs[0].id, jobs[2].id]);
    expect(result.items.map((item) => item.keywordScore)).toEqual([2, 1]);
    expect(result).toMatchObject({
      method: 'KEYWORD_OVERLAP_V1',
      scoreMeaning: 'DISTINCT_SHARED_TERMS_NOT_FIT_OR_SUPPORT',
      candidateCvId: cvId,
      parseResultId: parseId,
      fitScore: null,
      candidateSupportVerified: false,
      applicationCreated: false,
    });
    expect(result.items[0].matchedTerms).toContainEqual({
      term: 'python',
      cvSources: ['SKILLS'],
      jobSources: ['SKILLS', 'TITLE'],
    });
    expect(JSON.stringify(result)).not.toContain('Secret Name');
    expect(JSON.stringify(result)).not.toContain('secret@example.invalid');
    expect(http.post).not.toHaveBeenCalled();
    parsed.normalizedPayload = { ...payload, skills: [{ name: 'Java' }] };
    const other = await recommend();
    expect(other.items[0].job.id).toBe(jobs[1].id);
    expect(other.cvSnapshotSha256).not.toBe(result.cvSnapshotSha256);
  });
  it('accepts saved parse experience independently of any candidate profile fields', async () => {
    parsed.normalizedPayload = {
      ...payload,
      skills: [],
      experiences: [{ position: 'Backend Developer', description: 'Developed Python services.' }],
    };
    const result = await recommend();
    if (result.method !== 'KEYWORD_OVERLAP_V1') throw new Error('Expected keyword baseline');
    expect(result.status).toBe('READY');
    expect(result.parseResultId).toBe(parseId);
    expect(result.items[0].matchedTerms.some((item) => item.term === 'python')).toBe(true);
  });
  it('checks role and active CV ownership before any parse/job request; unparsed CV never triggers parsing', async () => {
    await expect(
      service.recommend({ ...user, role: UserRole.RECRUITER }, cvId, { limit: 10 }),
    ).rejects.toMatchObject({ status: 403 });
    expect(profiles.findOne).not.toHaveBeenCalled();
    cvs.findOne.mockResolvedValueOnce(null);
    await expect(recommend()).rejects.toMatchObject({ status: 404 });
    cvs.findOne.mockResolvedValueOnce({ ...cv, parseStatus: CandidateCvParseStatus.NOT_PARSED });
    await expect(recommend()).rejects.toMatchObject({ status: 409 });
    expect(http.get).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
    expect(cvs.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: cvId, candidateId, deletedAt: expect.anything() }),
      }),
    );
  });
  it('rejects mismatched parse/result/document identity and malformed saved payload with no lexical fallback', async () => {
    for (const key of ['candidateId', 'candidateCvId', 'documentId', 'id'] as const) {
      const before = parsed[key];
      parsed[key] = key === 'id' ? 'invalid' : randomUUID();
      await expect(recommend()).rejects.toMatchObject({ status: 503 });
      parsed[key] = before;
    }
    parsed.normalizedPayload = { skills: [] };
    await expect(recommend()).rejects.toMatchObject({ status: 503 });
    expect(http.post).not.toHaveBeenCalled();
  });
  it('returns explicit empty reasons, bounded pool metadata and no percentage claim', async () => {
    jobs = [];
    expect(await recommend()).toMatchObject({
      status: 'EMPTY',
      reason: 'NO_PUBLIC_JOBS',
      items: [],
      pool: { limit: 100, considered: 0, truncated: false },
    });
    jobs = [job('Rust developer', ['Rust'])];
    expect(await recommend()).toMatchObject({
      status: 'EMPTY',
      reason: 'NO_KEYWORD_OVERLAP',
      items: [],
    });
    parsed.normalizedPayload = {
      profile: {},
      skills: [],
      experiences: [],
      educations: [],
      certifications: [],
      projects: [],
    };
    expect(await recommend()).toMatchObject({
      status: 'EMPTY',
      reason: 'CV_TEXT_EMPTY',
      items: [],
    });
  });
  it('rechecks top-job visibility/content and CV state rather than returning withdrawn jobs or false empty results', async () => {
    changedVisibility = true;
    await expect(recommend()).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'RECOMMENDATIONS_SOURCE_CHANGED' }),
    });
    changedVisibility = false;
    cvs.findOne
      .mockResolvedValueOnce({ ...cv })
      .mockResolvedValueOnce({ ...cv, parsedAt: new Date() });
    await expect(recommend()).rejects.toMatchObject({ status: 409 });
    expect(http.get).toHaveBeenCalledWith(
      'http://job-fixture/api/v1/internal/jobs/recommendation-pool',
      expect.objectContaining({ params: { ids: [jobs[0].id, jobs[2].id].join(',') } }),
    );
  });
  it('preserves C/C++/C# and diacritics as separate terms and breaks ties deterministically', async () => {
    parsed.normalizedPayload = {
      ...payload,
      skills: [{ name: 'C++' }, { name: 'C#' }, { name: 'café' }],
    };
    const low = '21000000-0000-4000-8000-000000000001',
      high = '21000000-0000-4000-8000-000000000002';
    jobs = [job('C#', [], high), job('C++', [], low), job('C cafe', [])];
    const result = await recommend();
    if (result.method !== 'KEYWORD_OVERLAP_V1') throw new Error('Expected keyword baseline');
    expect(result.items.map((item) => item.job.id)).toEqual([low, high]);
    expect(result.items.map((item) => item.matchedTerms[0].term)).toEqual(['c++', 'c#']);
  });
  it('bounds query/pool and propagates dependency failure explicitly, with no POST/model request', async () => {
    await expect(service.recommend(user, cvId, { limit: 21 })).rejects.toMatchObject({
      status: 400,
    });
    http.get.mockReturnValueOnce(throwError(() => ({ response: { status: 404 } })));
    await expect(recommend()).rejects.toMatchObject({ status: 409 });
    http.get.mockReturnValueOnce(throwError(() => ({ response: { status: 503 } })));
    await expect(recommend()).rejects.toMatchObject({ status: 503 });
    expect(http.post).not.toHaveBeenCalled();
  });

  it('returns ranked semantic evidence only for the selected CV and checks the latest saved parse again', async () => {
    semanticEnabled = true;
    const evidence = { cvSource: 'SKILLS', cvText: 'Python', jobText: 'Python' };
    replySemantic({
      status: 'READY',
      indexedCount: 3,
      items: [{ jobId: jobs[0].id, score: 0.62, reasons: [evidence] }],
    });
    const result = await recommend();
    expect(result).toMatchObject({
      method: 'M1_REQUIREMENT_SEMANTIC_V1',
      pool: { indexed: 3 },
      items: [{ rank: 1, semanticScore: 0.62, evidence: [evidence] }],
      fitScore: null,
    });
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post.mock.calls[0][0]).toBe(
      'http://matching-fixture/api/v1/internal/job-recommendations',
    );
    expect(JSON.stringify(http.post.mock.calls[0][1])).not.toContain('secret@example.invalid');
    expect(http.get.mock.calls.filter(([url]) => url.endsWith('/latest-result'))).toHaveLength(2);
  });

  it('distinguishes a warming semantic index from an empty eligible pool', async () => {
    semanticEnabled = true;
    replySemantic({ status: 'INDEX_WARMING', indexedCount: 1, items: [] });
    await expect(recommend()).resolves.toMatchObject({
      status: 'INDEX_WARMING',
      reason: 'JD_INDEX_PENDING',
      pool: { indexed: 1 },
      items: [],
    });
    jobs = [];
    replySemantic({ status: 'EMPTY', indexedCount: 0, items: [] });
    await expect(recommend()).resolves.toMatchObject({
      status: 'EMPTY',
      reason: 'NO_PUBLIC_JOBS',
      items: [],
    });
  });

  it('rejects a reparse during ranking and omits a job withdrawn during ranking', async () => {
    semanticEnabled = true;
    const body = {
      status: 'READY',
      indexedCount: 3,
      items: [{ jobId: jobs[0].id, score: 0.4, reasons: [] }],
    };
    http.post.mockImplementationOnce(() => {
      parsed = { ...parsed, id: randomUUID() };
      return of({ data: { success: true, data: { modelVersion: 'local-m1', ...body } } });
    });
    await expect(recommend()).rejects.toMatchObject({ status: 409 });
    replySemantic(body);
    changedVisibility = true;
    await expect(recommend()).rejects.toMatchObject({ status: 409 });
  });

  it('rejects semantic citations with no exact saved CV or public JD source', async () => {
    semanticEnabled = true;
    replySemantic({
      status: 'READY',
      indexedCount: 3,
      items: [
        {
          jobId: jobs[0].id,
          score: 0.5,
          reasons: [{ cvSource: 'SKILLS', cvText: 'unrelated text', jobText: 'Python' }],
        },
      ],
    });
    await expect(recommend()).rejects.toMatchObject({ status: 503 });
  });
});

type MockRepo = {
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

function createRepoMock(): MockRepo {
  return {
    create: jest.fn((entity: unknown) => entity),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
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
    language: UserLanguage.VI,
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

function createManager(profileRepo: MockRepo): MockManager {
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
  let profileRepo: MockRepo;
  let skillRepo: MockRepo;
  let educationRepo: MockRepo;
  let experienceRepo: MockRepo;
  let certificationRepo: MockRepo;
  let projectRepo: MockRepo;
  let cvRepo: MockRepo;
  let documentClientService: { createDownloadUrl: jest.Mock; uploadCandidateDocument: jest.Mock };
  let authClientService: { getUserEmail: jest.Mock };
  let candidateEventPublisher: { publishProfileSnapshotChanged: jest.Mock };

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(),
    };
    profileRepo = createRepoMock();
    skillRepo = createRepoMock();
    educationRepo = createRepoMock();
    experienceRepo = createRepoMock();
    certificationRepo = createRepoMock();
    projectRepo = createRepoMock();
    cvRepo = createRepoMock();
    documentClientService = {
      createDownloadUrl: jest.fn(),
      uploadCandidateDocument: jest.fn(),
    };
    authClientService = {
      getUserEmail: jest.fn().mockResolvedValue(null),
    };
    candidateEventPublisher = {
      publishProfileSnapshotChanged: jest.fn().mockResolvedValue(undefined),
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
      candidateEventPublisher as unknown as CandidateEventPublisher,
    );
  });

  it('reads preparation ownership without creating profiles or resolving contact data', async () => {
    profileRepo.findOne.mockResolvedValue(createProfile());
    cvRepo.findOne.mockResolvedValue({ documentId: 'doc', parseStatus: 'PARSED' });
    await expect(service.getPreparationSource('user-1', 'cv-1')).resolves.toEqual({
      candidateId: 'candidate-1',
      cvDocumentId: 'doc',
    });
    expect(cvRepo.findOne.mock.calls[0][0].where).toMatchObject({
      id: 'cv-1',
      candidateId: 'candidate-1',
    });
    expect(profileRepo.save).not.toHaveBeenCalled();
    expect(cvRepo.update).not.toHaveBeenCalled();
    expect(authClientService.getUserEmail).not.toHaveBeenCalled();
  });

  it('rejects missing ownership and non-parsed CVs without writes', async () => {
    profileRepo.findOne.mockResolvedValue(null);
    await expect(service.getPreparationSource('foreign', 'cv')).rejects.toThrow(
      'Candidate CV not found',
    );
    expect(cvRepo.findOne).not.toHaveBeenCalled();
    profileRepo.findOne.mockResolvedValue(createProfile());
    cvRepo.findOne.mockResolvedValue({ parseStatus: 'PROCESSING' });
    await expect(service.getPreparationSource('user-1', 'cv')).rejects.toThrow(
      'Parse your selected CV',
    );
    expect(profileRepo.save).not.toHaveBeenCalled();
  });

  it('preserves matching evidence and source IDs in the v2 profile snapshot', async () => {
    profileRepo.findOne.mockResolvedValue(createProfile());
    skillRepo.find.mockResolvedValue([
      { id: 'skill-1', name: 'Java', level: null, yearsOfExperience: 3 },
    ]);
    experienceRepo.find.mockResolvedValue([
      {
        id: 'experience-1',
        position: 'Developer',
        companyName: 'Example',
        description: 'Built Spring Boot APIs',
        startYear: 2023,
        startMonth: 1,
        endYear: null,
        endMonth: null,
        isCurrent: true,
      },
    ]);
    educationRepo.find.mockResolvedValue([
      {
        id: 'education-1',
        degree: 'Bachelor',
        schoolName: 'University',
        fieldOfStudy: 'CS',
        description: 'Distributed systems',
      },
    ]);
    certificationRepo.find.mockResolvedValue([
      {
        id: 'certification-1',
        name: 'AWS',
        issuer: 'Amazon',
        issuedYear: 2025,
        description: 'Cloud architecture',
      },
    ]);
    projectRepo.find.mockResolvedValue([
      {
        id: 'project-1',
        name: 'ATS',
        description: 'Recruitment backend',
        technologies: ['Java', 'PostgreSQL'],
      },
    ]);

    const result = await service.getMatchingSnapshot('candidate-1');

    expect(result.snapshotSchemaVersion).toBe('candidate-matching-v2');
    expect(result.dataOrigin).toBe('PROFILE');
    expect(result.experiences[0]).toEqual(
      expect.objectContaining({ id: 'experience-1', description: 'Built Spring Boot APIs' }),
    );
    expect(result.educations[0].description).toBe('Distributed systems');
    expect(result.certifications[0]).toEqual(
      expect.objectContaining({ issuer: 'Amazon', issuedYear: 2025 }),
    );
    expect(result.projects[0]).toEqual(
      expect.objectContaining({
        description: 'Recruitment backend',
        technologies: ['Java', 'PostgreSQL'],
      }),
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
    expect(candidateEventPublisher.publishProfileSnapshotChanged).not.toHaveBeenCalled();
  });

  it('falls back to login email when profile contact email is empty', async () => {
    profileRepo.findOne.mockResolvedValue(createProfile({ contactEmail: null }));
    authClientService.getUserEmail.mockResolvedValue('candidate@nexhire.vn');

    const result = await service.getMe('user-1');

    expect(authClientService.getUserEmail).toHaveBeenCalledWith('user-1');
    expect(result.profile.contactEmail).toBe('candidate@nexhire.vn');
    expect(result.completionPercent).toBe(8);
    expect(candidateEventPublisher.publishProfileSnapshotChanged).not.toHaveBeenCalled();
  });

  it('returns avatarUrl when avatar document can be resolved', async () => {
    profileRepo.findOne.mockResolvedValue(
      createProfile({
        avatarDocumentId: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5',
      }),
    );
    documentClientService.createDownloadUrl.mockResolvedValue({
      url: 'https://storage.local/avatar.png',
      expiresInSeconds: 3600,
    });

    const result = await service.getMe('user-1');

    expect(documentClientService.createDownloadUrl).toHaveBeenCalledWith(
      'b8b33c46-4bb0-4a33-8b0d-927e081a38a5',
    );
    expect(result.profile.avatarDocumentId).toBe('b8b33c46-4bb0-4a33-8b0d-927e081a38a5');
    expect(result.profile.avatarUrl).toBe('https://storage.local/avatar.png');
  });

  it('keeps profile response available when avatar URL cannot be resolved', async () => {
    profileRepo.findOne.mockResolvedValue(
      createProfile({
        avatarDocumentId: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5',
      }),
    );
    documentClientService.createDownloadUrl.mockRejectedValue(new Error('document unavailable'));

    const result = await service.getMe('user-1');

    expect(result.profile.avatarDocumentId).toBe('b8b33c46-4bb0-4a33-8b0d-927e081a38a5');
    expect(result.profile.avatarUrl).toBeNull();
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
      language: UserLanguage.JA,
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
        language: UserLanguage.JA,
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
        language: UserLanguage.JA,
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
    expect(candidateEventPublisher.publishProfileSnapshotChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        candidateUserId: 'user-1',
        fullName: 'Nguyen Minh Khoa',
        email: 'khoa@example.com',
        phone: '0912345678',
        language: UserLanguage.JA,
      }),
    );
    expect(result.completionPercent).toBe(100);
  });

  it('clears nullable profile fields when update payload sends null', async () => {
    const existingProfile = createProfile({
      fullName: 'Nguyen Minh Khoa',
      phone: '0912345678',
      contactEmail: 'khoa@example.com',
      headline: 'Senior Frontend Engineer',
      summary: 'Builds performant web products',
      location: 'Ha Noi',
      portfolioUrl: 'https://minhkhoa.dev',
      linkedinUrl: 'https://linkedin.com/in/minhkhoa',
      avatarDocumentId: 'b8b33c46-4bb0-4a33-8b0d-927e081a38a5',
    });
    const manager = createManager(profileRepo);
    profileRepo.findOne.mockResolvedValue(existingProfile);
    manager.findOneOrFail.mockResolvedValue(
      createProfile({
        ...existingProfile,
        fullName: null,
        phone: null,
        contactEmail: null,
        headline: null,
        summary: null,
        location: null,
        portfolioUrl: null,
        linkedinUrl: null,
        avatarDocumentId: null,
      }),
    );
    dataSource.transaction.mockImplementation((callback: (manager: EntityManager) => unknown) =>
      callback(manager as unknown as EntityManager),
    );

    await service.updateMe('user-1', {
      profile: {
        fullName: null,
        phone: null,
        contactEmail: null,
        headline: null,
        summary: null,
        location: null,
        portfolioUrl: null,
        linkedinUrl: null,
        avatarDocumentId: null,
      },
    });

    expect(manager.update).toHaveBeenCalledWith(CandidateProfile, 'candidate-1', {
      fullName: null,
      phone: null,
      contactEmail: null,
      headline: null,
      summary: null,
      location: null,
      portfolioUrl: null,
      linkedinUrl: null,
      avatarDocumentId: null,
    });
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

  it('applies parsed resume data to candidate profile sections', async () => {
    const existingProfile = createProfile();
    const updatedProfile = createProfile({
      fullName: 'Nguyen Trung Hau',
      phone: '0849710139',
      contactEmail: 'ntrghau@gmail.com',
      headline: 'Backend Developer',
      summary: 'Aspiring backend engineer',
      location: 'Ho Chi Minh, Viet Nam',
      portfolioUrl: 'https://github.com/HauiZ',
    });
    const manager = createManager(profileRepo);
    manager.findOneOrFail.mockResolvedValue(updatedProfile);
    dataSource.transaction.mockImplementation((callback: (manager: EntityManager) => unknown) =>
      callback(manager as unknown as EntityManager),
    );
    profileRepo.findOne.mockResolvedValue(updatedProfile);

    await service.applyParsedResume(
      existingProfile.id,
      {
        profile: {
          fullName: 'Nguyen Trung Hau',
          phone: '0849710139',
          contactEmail: 'ntrghau@gmail.com',
          headline: 'Backend Developer',
          summary: 'Aspiring backend engineer',
          location: 'Ho Chi Minh, Viet Nam',
          portfolioUrl: 'https://github.com/HauiZ',
        },
        skills: [{ name: 'NestJS' }, { name: 'PostgreSQL' }],
        experiences: [],
        educations: [
          {
            schoolName: 'Posts and Telecommunications Institute of Technology (PTIT)',
            degree: 'Bachelor of Information Technology',
            fieldOfStudy: 'Software Engineering',
            startYear: 2022,
            endYear: 2027,
            isCurrent: true,
            description: 'GPA: 3.22/4.0',
          },
        ],
        certifications: [
          {
            name: 'TOEIC (Listening & Reading)',
            issuedYear: 2026,
            description: 'Score: 745/990',
          },
        ],
        projects: [
          {
            name: 'Recruitment Backend System',
            description: 'Developed a recruitment backend system',
            technologies: ['Node.js', 'Express', 'PostgreSQL'],
            projectUrl: 'https://github.com/HauiZ/Backend_CVW.git',
          },
        ],
      },
      'cv-1',
    );

    expect(manager.update).toHaveBeenCalledWith(
      CandidateProfile,
      'candidate-1',
      expect.objectContaining({
        fullName: 'Nguyen Trung Hau',
        contactEmail: 'ntrghau@gmail.com',
      }),
    );
    expect(manager.delete).toHaveBeenCalledWith(CandidateSkill, {
      candidateId: 'candidate-1',
      source: CandidateDataSource.CV_PARSE,
    });
    expect(manager.save).toHaveBeenCalledWith(
      CandidateEducation,
      expect.arrayContaining([
        expect.objectContaining({
          schoolName: 'Posts and Telecommunications Institute of Technology (PTIT)',
          startYear: 2022,
          endYear: 2027,
          isCurrent: true,
          source: CandidateDataSource.CV_PARSE,
        }),
      ]),
    );
    expect(manager.save).toHaveBeenCalledWith(
      CandidateProject,
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Recruitment Backend System',
          technologies: ['Node.js', 'Express', 'PostgreSQL'],
          source: CandidateDataSource.CV_PARSE,
        }),
      ]),
    );
    expect(manager.update).toHaveBeenCalledWith(
      CandidateCv,
      { id: 'cv-1', candidateId: 'candidate-1' },
      expect.objectContaining({
        parseStatus: 'PARSED',
        parsedAt: expect.any(Date),
      }),
    );
    expect(candidateEventPublisher.publishProfileSnapshotChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        candidateUserId: 'user-1',
        fullName: 'Nguyen Trung Hau',
        email: 'ntrghau@gmail.com',
        phone: '0849710139',
      }),
    );
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
      where: { id: 'cv-1', candidateId: 'candidate-1', deletedAt: expect.any(Object) },
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
