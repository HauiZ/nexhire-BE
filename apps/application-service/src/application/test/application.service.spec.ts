import { HttpException } from '@nestjs/common';
import { ApplicationProgressStep, ApplicationStage, ERROR_CODES, UserRole } from '@nexhire/shared';
import { Repository } from 'typeorm';
import { ApplicationInternalClientService } from '../application-internal-client.service';
import { ApplicationService } from '../application.service';
import { Application, ApplicationMatchLevel } from '../entities/application.entity';
import {
  ApplicationProgressActorType,
  ApplicationProgressEvent,
} from '../entities/application-progress-event.entity';
import { ApplicationEventPublisher } from '../events/application-event.publisher';

type MockRepo = {
  count: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  createQueryBuilder: jest.Mock;
  update: jest.Mock;
};

const candidateUser = { id: '11111111-1111-1111-1111-111111111111', role: UserRole.CANDIDATE };
const recruiterUser = {
  id: '22222222-2222-2222-2222-222222222222',
  role: UserRole.RECRUITER,
  companyId: '33333333-3333-3333-3333-333333333333',
};

const application: Application = {
  id: '44444444-4444-4444-4444-444444444444',
  jobId: '55555555-5555-5555-5555-555555555555',
  jobTitle: 'Backend Engineer',
  companyId: recruiterUser.companyId,
  companyName: 'Nexhire',
  companyLogoUrl: null,
  companyLogoDocumentId: null,
  candidateId: '66666666-6666-6666-6666-666666666666',
  candidateUserId: candidateUser.id,
  candidateFullName: 'Candidate One',
  candidateEmail: 'candidate@nexhire.vn',
  candidatePhone: null,
  candidateAvatarDocumentId: null,
  candidateCvId: '77777777-7777-7777-7777-777777777777',
  cvDocumentId: '88888888-8888-8888-8888-888888888888',
  cvTitle: 'CV.pdf',
  cvFileName: 'CV.pdf',
  cvMimeType: 'application/pdf',
  cvSize: 1234,
  cvParseStatus: 'PARSED',
  coverLetter: null,
  status: ApplicationStage.SUBMITTED,
  statusNote: null,
  currentProgressStep: null,
  matchScore: null,
  matchLevel: null,
  submittedAt: new Date('2026-07-15T00:00:00.000Z'),
  withdrawnAt: null,
  decidedAt: null,
  cancelledAt: null,
  firstCvReceivedAt: null,
  firstCvViewedAt: null,
  createdAt: new Date('2026-07-15T00:00:00.000Z'),
  updatedAt: new Date('2026-07-15T00:00:00.000Z'),
  deletedAt: null,
};

const parsedResume = {
  profile: { fullName: 'Candidate One' },
  skills: [],
  experiences: [],
  educations: [],
  certifications: [],
  projects: [],
};

describe('ApplicationService', () => {
  let service: ApplicationService;
  let repo: MockRepo;
  let progressEventRepo: Pick<MockRepo, 'find' | 'findOne' | 'save' | 'create'>;
  let internalClient: {
    getJobApplicationSnapshot: jest.Mock;
    getCandidateApplicationSnapshot: jest.Mock;
    getDocumentDownload: jest.Mock;
    getLatestCvParseResult: jest.Mock;
    getLatestApplicationMatchResult: jest.Mock;
    createApplicationMatchRequest: jest.Mock;
    requestCandidateCvParse: jest.Mock;
  };
  let applicationEventPublisher: {
    publishApplicationSubmitted: jest.Mock;
    publishApplicationStageChanged: jest.Mock;
    publishApplicationCvViewed: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      count: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((payload: Application) => Promise.resolve({ ...payload, id: application.id })),
      create: jest.fn((payload: Partial<Application>) => payload),
      createQueryBuilder: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    progressEventRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn((payload: ApplicationProgressEvent) => Promise.resolve(payload)),
      create: jest.fn((payload: Partial<ApplicationProgressEvent>) => payload),
    };
    internalClient = {
      getJobApplicationSnapshot: jest.fn().mockResolvedValue({
        id: application.jobId,
        companyId: application.companyId,
        companyName: application.companyName,
        companyLogoUrl: application.companyLogoUrl,
        title: application.jobTitle,
        status: 'PUBLISHED',
        deadline: null,
        isApplyable: true,
      }),
      getCandidateApplicationSnapshot: jest.fn().mockResolvedValue({
        candidateId: application.candidateId,
        candidateUserId: application.candidateUserId,
        fullName: application.candidateFullName,
        email: application.candidateEmail,
        phone: application.candidatePhone,
        avatarDocumentId: application.candidateAvatarDocumentId,
        candidateCvId: application.candidateCvId,
        cvDocumentId: application.cvDocumentId,
        cvTitle: application.cvTitle,
        cvParseStatus: application.cvParseStatus,
      }),
      getDocumentDownload: jest.fn().mockResolvedValue({
        id: application.cvDocumentId,
        fileName: 'CV.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        url: 'https://storage.local/cv',
        expiresInSeconds: 3600,
      }),
      getLatestCvParseResult: jest.fn().mockResolvedValue({
        id: 'parse-result-1',
        parseRequestId: 'parse-request-1',
        candidateId: application.candidateId,
        candidateCvId: application.candidateCvId,
        documentId: application.cvDocumentId,
        normalizedPayload: parsedResume,
        createdAt: '2026-07-15T00:00:00.000Z',
      }),
      getLatestApplicationMatchResult: jest.fn().mockResolvedValue(null),
      createApplicationMatchRequest: jest.fn().mockResolvedValue({
        id: 'match-request-1',
        applicationId: application.id,
        status: 'PENDING',
        requestType: 'AUTO_APPLICATION',
      }),
      requestCandidateCvParse: jest.fn().mockResolvedValue({
        id: application.candidateCvId,
        documentId: application.cvDocumentId,
        title: application.cvTitle,
        isDefault: true,
        parseStatus: 'PARSING',
      }),
    };
    applicationEventPublisher = {
      publishApplicationSubmitted: jest.fn().mockResolvedValue(undefined),
      publishApplicationStageChanged: jest.fn().mockResolvedValue(undefined),
      publishApplicationCvViewed: jest.fn().mockResolvedValue(undefined),
    };

    service = new ApplicationService(
      internalClient as unknown as ApplicationInternalClientService,
      applicationEventPublisher as unknown as ApplicationEventPublisher,
      repo as unknown as Repository<Application>,
      progressEventRepo as unknown as Repository<ApplicationProgressEvent>,
    );
  });

  it('creates an application and publishes application.submitted', async () => {
    repo.findOne.mockResolvedValue(null);

    const result = await service.create(candidateUser, {
      jobId: application.jobId,
      candidateCvId: application.candidateCvId,
      coverLetter: ' Hello ',
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: application.jobId,
        candidateUserId: candidateUser.id,
        coverLetter: 'Hello',
        cvFileName: 'CV.pdf',
        cvMimeType: 'application/pdf',
        cvSize: 1234,
        status: ApplicationStage.SUBMITTED,
      }),
    );
    expect(applicationEventPublisher.publishApplicationSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: application.jobId,
        candidateUserId: candidateUser.id,
        candidateAvatarDocumentId: application.candidateAvatarDocumentId,
        companyLogoUrl: application.companyLogoUrl,
      }),
    );
    expect(progressEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: application.id,
        step: ApplicationProgressStep.CV_SUBMITTED,
        actorType: ApplicationProgressActorType.CANDIDATE,
        actorUserId: candidateUser.id,
      }),
    );
    expect(progressEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: application.id,
        step: ApplicationProgressStep.CV_RECEIVED,
        actorType: ApplicationProgressActorType.SYSTEM,
        actorUserId: null,
      }),
    );
    expect(result.status).toBe(ApplicationStage.SUBMITTED);
    expect(result.matchScore).toBeNull();
    expect(internalClient.getLatestCvParseResult).toHaveBeenCalledWith(application.candidateCvId);
    expect(internalClient.createApplicationMatchRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        id: application.id,
        requestType: 'AUTO_APPLICATION',
        parsedResume: expect.any(Object),
      }),
    );
  });

  it('requests CV parsing before matching when applied CV is not parsed', async () => {
    repo.findOne.mockResolvedValue(null);
    internalClient.getCandidateApplicationSnapshot.mockResolvedValueOnce({
      candidateId: application.candidateId,
      candidateUserId: application.candidateUserId,
      fullName: application.candidateFullName,
      email: application.candidateEmail,
      phone: application.candidatePhone,
      avatarDocumentId: application.candidateAvatarDocumentId,
      candidateCvId: application.candidateCvId,
      cvDocumentId: application.cvDocumentId,
      cvTitle: application.cvTitle,
      cvParseStatus: 'NOT_PARSED',
    });

    await service.create(candidateUser, {
      jobId: application.jobId,
      candidateCvId: application.candidateCvId,
    });

    expect(internalClient.requestCandidateCvParse).toHaveBeenCalledWith({
      candidateId: application.candidateId,
      candidateCvId: application.candidateCvId,
      requestedByUserId: application.candidateUserId,
    });
    expect(internalClient.createApplicationMatchRequest).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ cvParseStatus: 'PARSING' }));
  });

  it('allows CV document purge when there are no active or recent terminal applications', async () => {
    repo.count.mockResolvedValueOnce(0);
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
    repo.findOne.mockResolvedValue({
      ...application,
      status: ApplicationStage.REJECTED,
    } as Application);

    const result = await service.getCvDocumentRetention(
      application.cvDocumentId,
      '2026-01-01T00:00:00.000Z',
    );

    expect(result).toEqual({
      documentId: application.cvDocumentId,
      canDelete: true,
      activeApplicationCount: 0,
      recentTerminalApplicationCount: 0,
      blockingStatus: null,
    });
  });

  it('blocks CV document purge when active applications still use the document', async () => {
    repo.count.mockResolvedValueOnce(1);
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
    repo.findOne.mockResolvedValue(application);

    const result = await service.getCvDocumentRetention(
      application.cvDocumentId,
      '2026-01-01T00:00:00.000Z',
    );

    expect(result.canDelete).toBe(false);
    expect(result.activeApplicationCount).toBe(1);
    expect(result.blockingStatus).toBe(ApplicationStage.SUBMITTED);
  });

  it('blocks duplicate active applications', async () => {
    repo.findOne.mockResolvedValue(application);

    await expect(
      service.create(candidateUser, {
        jobId: application.jobId,
        candidateCvId: application.candidateCvId,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('allows withdrawing active applications', async () => {
    repo.findOne.mockResolvedValue({ ...application });

    const result = await service.withdrawMine(candidateUser, application.id, { note: 'later' });

    expect(result.status).toBe(ApplicationStage.WITHDRAWN);
    expect(applicationEventPublisher.publishApplicationStageChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: application.id,
        previousStatus: ApplicationStage.SUBMITTED,
        status: ApplicationStage.WITHDRAWN,
      }),
    );
  });

  it('returns CV download only for recruiter company scope', async () => {
    repo.findOne.mockResolvedValue(application);

    const result = await service.getCompanyCvDownload(recruiterUser, application.id);

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: application.id, companyId: recruiterUser.companyId },
    });
    expect(progressEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: application.id,
        step: ApplicationProgressStep.CV_VIEWED,
        actorType: ApplicationProgressActorType.RECRUITER,
        actorUserId: recruiterUser.id,
      }),
    );
    expect(applicationEventPublisher.publishApplicationCvViewed).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: application.id,
        candidateUserId: application.candidateUserId,
        viewedByUserId: recruiterUser.id,
      }),
    );
    expect(result.url).toBe('https://storage.local/cv');
  });

  it('enriches recruiter application detail with latest AI match recommendation', async () => {
    repo.findOne.mockResolvedValue({ ...application, matchScore: 82, matchLevel: ApplicationMatchLevel.HIGH });
    internalClient.getLatestApplicationMatchResult.mockResolvedValueOnce({
      id: 'match-result-1',
      matchRequestId: 'match-request-1',
      applicationId: application.id,
      jobId: application.jobId,
      candidateId: application.candidateId,
      candidateCvId: application.candidateCvId,
      status: 'SUCCEEDED',
      totalScore: 82,
      matchLevel: 'HIGH',
      explanation: {
        matchedSkills: ['nestjs'],
        missingSkills: ['redis'],
        recommendation: 'GOOD_FIT',
        decision: 'REVIEW_MANUALLY',
        priority: 'HIGH',
        summary: 'Review the profile before shortlisting.',
        nextActions: ['Review CV details before shortlisting'],
        riskFlags: ['MISSING_REDIS'],
      },
      createdAt: '2026-07-15T00:00:00.000Z',
    });

    const result = await service.getCompanyApplication(recruiterUser, application.id);

    expect(internalClient.getLatestApplicationMatchResult).toHaveBeenCalledWith(application.id);
    expect(result.matchScore).toBe(82);
    expect(result.matchLevel).toBe(ApplicationMatchLevel.HIGH);
    expect(result.matchDecision).toBe('REVIEW_MANUALLY');
    expect(result.matchNextActions).toEqual(['Review CV details before shortlisting']);
    expect(result.matchRiskFlags).toEqual(['MISSING_REDIS']);
  });

  it('allows recruiter to offer an application and publishes stage change snapshot', async () => {
    repo.findOne.mockResolvedValue({ ...application });

    const result = await service.updateCompanyStage(recruiterUser, application.id, {
      status: ApplicationStage.OFFERED,
      note: 'Interview next',
    });

    expect(result.status).toBe(ApplicationStage.OFFERED);
    expect(applicationEventPublisher.publishApplicationStageChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: application.id,
        previousStatus: ApplicationStage.SUBMITTED,
        status: ApplicationStage.OFFERED,
        note: 'Interview next',
        companyLogoUrl: application.companyLogoUrl,
        candidateAvatarDocumentId: application.candidateAvatarDocumentId,
      }),
    );
    expect(progressEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: application.id,
        step: ApplicationProgressStep.RESPONDED,
        actorType: ApplicationProgressActorType.RECRUITER,
        actorUserId: recruiterUser.id,
        metadata: { status: ApplicationStage.OFFERED },
      }),
    );
  });

  it('returns recruiter application stats for the requested date window', async () => {
    const statusQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValueOnce([
          { status: ApplicationStage.SUBMITTED, count: '2' },
          { status: ApplicationStage.OFFERED, count: '1' },
        ])
        .mockResolvedValueOnce([
          { date: '2026-07-15', status: ApplicationStage.SUBMITTED, count: '2' },
          { date: '2026-07-16', status: ApplicationStage.OFFERED, count: '1' },
        ]),
    };
    repo.createQueryBuilder.mockReturnValue(statusQb);

    const result = await service.getRecruiterStats(recruiterUser, {
      from: '2026-07-15',
      to: '2026-07-16',
    });

    expect(result.total).toBe(3);
    expect(result.byStatus.SUBMITTED).toBe(2);
    expect(result.byStatus.OFFERED).toBe(1);
    expect(result.responseRate).toBe(33);
    expect(result.byDay).toEqual([
      expect.objectContaining({ date: '2026-07-15', submitted: 2 }),
      expect.objectContaining({ date: '2026-07-16', offered: 1 }),
    ]);
  });

  it('updates application match score snapshot for matching-service', async () => {
    repo.findOne.mockResolvedValue({ ...application });

    const result = await service.updateMatchSnapshot(application.id, { matchScore: 92 });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        matchScore: 92,
        matchLevel: ApplicationMatchLevel.EXCELLENT,
      }),
    );
    expect(result.matchScore).toBe(92);
    expect(result.matchLevel).toBe(ApplicationMatchLevel.EXCELLENT);
  });

  it('requests recruiter manual matching immediately when CV is parsed', async () => {
    repo.findOne.mockResolvedValue({ ...application });

    const result = await service.requestCompanyApplicationMatch(recruiterUser, application.id);

    expect(result).toEqual(expect.objectContaining({ id: 'match-request-1' }));
    expect(internalClient.getLatestCvParseResult).toHaveBeenCalledWith(application.candidateCvId);
    expect(internalClient.createApplicationMatchRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        id: application.id,
        requestType: 'RECRUITER_MANUAL',
        requestedByUserId: recruiterUser.id,
        parsedResume: expect.any(Object),
      }),
    );
  });

  it('lets recruiter manual matching trigger parse first when CV is not parsed', async () => {
    repo.findOne.mockResolvedValue({ ...application, cvParseStatus: 'NOT_PARSED' });

    const result = await service.requestCompanyApplicationMatch(recruiterUser, application.id);

    expect(result).toEqual({
      id: null,
      applicationId: application.id,
      status: 'WAITING_FOR_CV_PARSE',
      requestType: 'RECRUITER_MANUAL',
    });
    expect(internalClient.requestCandidateCvParse).toHaveBeenCalledWith({
      candidateId: application.candidateId,
      candidateCvId: application.candidateCvId,
      requestedByUserId: recruiterUser.id,
    });
    expect(internalClient.createApplicationMatchRequest).not.toHaveBeenCalled();
  });

  it('forces CV parsing when application says parsed but parsed result is missing', async () => {
    repo.findOne.mockResolvedValue({ ...application, cvParseStatus: 'PARSED' });
    internalClient.getLatestCvParseResult.mockRejectedValueOnce(
      new HttpException(
        {
          success: false,
          error: {
            code: ERROR_CODES.COMMON.NOT_FOUND,
            message: 'Parsed CV result not found',
          },
        },
        400,
      ),
    );

    const result = await service.requestCompanyApplicationMatch(recruiterUser, application.id);

    expect(result).toEqual({
      id: null,
      applicationId: application.id,
      status: 'WAITING_FOR_CV_PARSE',
      requestType: 'RECRUITER_MANUAL',
    });
    expect(internalClient.requestCandidateCvParse).toHaveBeenCalledWith({
      candidateId: application.candidateId,
      candidateCvId: application.candidateCvId,
      requestedByUserId: recruiterUser.id,
      force: true,
    });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ cvParseStatus: 'PARSING' }));
    expect(internalClient.createApplicationMatchRequest).not.toHaveBeenCalled();
  });

  it('updates application CV parse status and queues matching when cv.parsed arrives', async () => {
    repo.find.mockResolvedValue([{ ...application, cvParseStatus: 'PARSING' }]);

    await service.handleCvParsedForMatching({
      candidateCvId: application.candidateCvId,
      normalizedPayload: parsedResume,
    });

    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ cvParseStatus: 'PARSED' }));
    expect(internalClient.createApplicationMatchRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        id: application.id,
        requestType: 'AUTO_APPLICATION',
        parsedResume,
      }),
    );
  });

  it('requeues matching for already-scored active applications when CV is parsed again', async () => {
    repo.find.mockResolvedValue([{ ...application, cvParseStatus: 'PARSED', matchScore: 72 }]);

    await service.handleCvParsedForMatching({
      candidateCvId: application.candidateCvId,
      normalizedPayload: parsedResume,
    });

    expect(repo.find).toHaveBeenCalledWith({
      where: {
        candidateCvId: application.candidateCvId,
        status: expect.any(Object),
      },
      order: { submittedAt: 'ASC' },
    });
    expect(internalClient.createApplicationMatchRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        id: application.id,
        requestType: 'AUTO_APPLICATION',
        parsedResume,
      }),
    );
  });

  it('marks waiting application matching as failed when cv.parse-failed arrives', async () => {
    repo.find.mockResolvedValue([{ ...application, cvParseStatus: 'PARSING' }]);

    await service.handleCvParseFailedForMatching({
      candidateCvId: application.candidateCvId,
      errorMessage: 'Unable to parse document',
    });

    expect(repo.find).toHaveBeenCalledWith({
      where: {
        candidateCvId: application.candidateCvId,
        status: expect.any(Object),
        cvParseStatus: 'PARSING',
      },
      order: { submittedAt: 'ASC' },
    });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ cvParseStatus: 'FAILED' }));
    expect(internalClient.createApplicationMatchRequest).not.toHaveBeenCalled();
  });

  it('cancels active applications when a job is closed', async () => {
    repo.find.mockResolvedValue([{ ...application }]);

    await service.handleJobClosed({
      jobId: application.jobId,
      companyId: application.companyId,
      reason: 'Position filled',
      closedAt: '2026-07-16T00:00:00.000Z',
    });

    expect(repo.find).toHaveBeenCalledWith({
      where: {
        jobId: application.jobId,
        status: expect.any(Object),
      },
    });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ApplicationStage.CANCELLED,
        statusNote: 'Position filled',
        cancelledAt: expect.any(Date),
      }),
    );
    expect(applicationEventPublisher.publishApplicationStageChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: application.id,
        previousStatus: ApplicationStage.SUBMITTED,
        status: ApplicationStage.CANCELLED,
      }),
    );
    expect(progressEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: application.id,
        step: ApplicationProgressStep.CANCELLED,
        actorType: ApplicationProgressActorType.SYSTEM,
        actorUserId: null,
      }),
    );
  });

  it('syncs candidate display snapshot without touching submitted CV snapshot', async () => {
    await service.syncCandidateProfileSnapshot({
      candidateId: application.candidateId,
      candidateUserId: application.candidateUserId,
      fullName: 'New Name',
      email: 'new@nexhire.vn',
      phone: '0909000000',
      avatarDocumentId: '99999999-9999-9999-9999-999999999999',
    });

    expect(repo.update).toHaveBeenCalledWith(
      { candidateUserId: application.candidateUserId },
      {
        candidateFullName: 'New Name',
        candidateEmail: 'new@nexhire.vn',
        candidatePhone: '0909000000',
        candidateAvatarDocumentId: '99999999-9999-9999-9999-999999999999',
      },
    );
  });
});
