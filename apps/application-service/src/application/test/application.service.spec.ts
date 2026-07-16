import { ApplicationStage, UserRole } from '@nexhire/shared';
import { Repository } from 'typeorm';
import { ApplicationInternalClientService } from '../application-internal-client.service';
import { ApplicationService } from '../application.service';
import { Application } from '../entities/application.entity';
import { ApplicationEventPublisher } from '../events/application-event.publisher';

type MockRepo = {
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
  submittedAt: new Date('2026-07-15T00:00:00.000Z'),
  withdrawnAt: null,
  decidedAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-07-15T00:00:00.000Z'),
  updatedAt: new Date('2026-07-15T00:00:00.000Z'),
  deletedAt: null,
};

describe('ApplicationService', () => {
  let service: ApplicationService;
  let repo: MockRepo;
  let internalClient: {
    getJobApplicationSnapshot: jest.Mock;
    getCandidateApplicationSnapshot: jest.Mock;
    getDocumentDownload: jest.Mock;
  };
  let applicationEventPublisher: {
    publishApplicationSubmitted: jest.Mock;
    publishApplicationStageChanged: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((payload: Application) => Promise.resolve({ ...payload, id: application.id })),
      create: jest.fn((payload: Partial<Application>) => payload),
      createQueryBuilder: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
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
    };
    applicationEventPublisher = {
      publishApplicationSubmitted: jest.fn().mockResolvedValue(undefined),
      publishApplicationStageChanged: jest.fn().mockResolvedValue(undefined),
    };

    service = new ApplicationService(
      internalClient as unknown as ApplicationInternalClientService,
      applicationEventPublisher as unknown as ApplicationEventPublisher,
      repo as unknown as Repository<Application>,
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
    expect(result.status).toBe(ApplicationStage.SUBMITTED);
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
    expect(result.url).toBe('https://storage.local/cv');
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
