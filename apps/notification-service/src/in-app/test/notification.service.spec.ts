import { ApplicationStage, CompanyStatus, UserRole } from '@nexhire/shared';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import {
  NotificationRecipientType,
  NotificationSenderType,
  NotificationType,
} from '../entities/notification.enum';
import { NotificationService } from '../notification.service';

type MockRepo = {
  create: jest.Mock;
  save: jest.Mock;
  createQueryBuilder: jest.Mock;
};

const mockInsertBuilder = () => ({
  insert: jest.fn().mockReturnThis(),
  into: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  orIgnore: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({}),
});

describe('NotificationService', () => {
  let service: NotificationService;
  let repo: MockRepo;
  let adminRecipientClient: { listAdminRecipients: jest.Mock };

  beforeEach(() => {
    repo = {
      create: jest.fn((payload: Partial<Notification>) => payload),
      save: jest.fn((payload: unknown) => Promise.resolve(payload)),
      createQueryBuilder: jest.fn(),
    };
    adminRecipientClient = {
      listAdminRecipients: jest
        .fn()
        .mockResolvedValue([{ id: 'admin-1', email: 'admin@nexhire.vn', fullName: 'Admin One' }]),
    };
    service = new NotificationService(
      repo as unknown as Repository<Notification>,
      adminRecipientClient as never,
    );
  });

  it('creates candidate and company notifications when an application is submitted', async () => {
    const qb = mockInsertBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.createApplicationSubmittedNotifications({
      applicationId: 'application-1',
      jobId: 'job-1',
      jobTitle: 'Backend Engineer',
      companyId: 'company-1',
      companyName: 'NexHire',
      companyLogoUrl: 'https://cdn.nexhire.vn/logo.png',
      candidateId: 'candidate-1',
      candidateUserId: 'user-1',
      candidateFullName: 'Candidate One',
      candidateAvatarDocumentId: 'avatar-1',
    });

    expect(qb.orIgnore).toHaveBeenCalled();
    expect(qb.values).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: 'user-1',
        dedupeKey: 'application-submitted:user:application-1',
        senderType: NotificationSenderType.COMPANY,
        senderEntityId: 'company-1',
        senderName: 'NexHire',
        senderLogoUrl: 'https://cdn.nexhire.vn/logo.png',
        type: NotificationType.APPLICATION_SUBMITTED,
      }),
      expect.objectContaining({
        recipientType: NotificationRecipientType.COMPANY,
        recipientCompanyId: 'company-1',
        dedupeKey: 'application-submitted:company:application-1',
        senderType: NotificationSenderType.CANDIDATE,
        senderEntityId: 'candidate-1',
        senderName: 'Candidate One',
        senderAvatarDocumentId: 'avatar-1',
        type: NotificationType.APPLICATION_SUBMITTED,
      }),
    ]);
  });

  it('creates candidate notification for offered stage', async () => {
    const qb = mockInsertBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.createApplicationStageChangedNotification({
      applicationId: 'application-1',
      jobId: 'job-1',
      jobTitle: 'Backend Engineer',
      companyId: 'company-1',
      companyName: 'NexHire',
      companyLogoUrl: 'https://cdn.nexhire.vn/logo.png',
      candidateId: 'candidate-1',
      candidateUserId: 'user-1',
      previousStatus: ApplicationStage.SUBMITTED,
      status: ApplicationStage.OFFERED,
      changedAt: '2026-07-16T00:00:00.000Z',
    });

    expect(qb.values).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: 'user-1',
        dedupeKey: 'application-stage:user:application-1:OFFERED:2026-07-16T00:00:00.000Z',
        senderType: NotificationSenderType.COMPANY,
        senderEntityId: 'company-1',
        senderName: 'NexHire',
        senderLogoUrl: 'https://cdn.nexhire.vn/logo.png',
        type: NotificationType.APPLICATION_STAGE_CHANGED,
      }),
    ]);
  });

  it('creates candidate notification when recruiter views CV', async () => {
    const qb = mockInsertBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.createApplicationCvViewedNotification({
      applicationId: 'application-1',
      jobId: 'job-1',
      jobTitle: 'Backend Engineer',
      companyId: 'company-1',
      companyName: 'NexHire',
      companyLogoUrl: 'https://cdn.nexhire.vn/logo.png',
      candidateId: 'candidate-1',
      candidateUserId: 'user-1',
      viewedByUserId: 'recruiter-1',
      viewedAt: '2026-08-03T09:00:00.000Z',
    });

    expect(qb.values).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: 'user-1',
        dedupeKey: 'application-cv-viewed:user:application-1',
        senderType: NotificationSenderType.COMPANY,
        senderEntityId: 'company-1',
        senderName: 'NexHire',
        senderLogoUrl: 'https://cdn.nexhire.vn/logo.png',
        type: NotificationType.APPLICATION_CV_VIEWED,
        data: expect.objectContaining({
          applicationId: 'application-1',
          viewedByUserId: 'recruiter-1',
          viewedAt: '2026-08-03T09:00:00.000Z',
        }),
      }),
    ]);
  });

  it('creates owner notification when company status changes', async () => {
    const qb = mockInsertBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.createCompanyVerificationChangedNotification({
      companyId: 'company-1',
      ownerUserId: 'owner-1',
      companyName: 'NexHire',
      companyStatus: CompanyStatus.APPROVED,
      changedAt: '2026-07-16T00:00:00.000Z',
    });

    expect(qb.values).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: 'owner-1',
        dedupeKey: 'company-status:user:company-1:APPROVED:2026-07-16T00:00:00.000Z',
        senderType: NotificationSenderType.SYSTEM,
        type: NotificationType.COMPANY_VERIFICATION_CHANGED,
      }),
    ]);
  });

  it('does not create company status notification when status is unchanged', async () => {
    const qb = mockInsertBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.createCompanyVerificationChangedNotification({
      companyId: 'company-1',
      ownerUserId: 'owner-1',
      companyName: 'NexHire',
      companyStatus: CompanyStatus.APPROVED,
      previousCompanyStatus: CompanyStatus.APPROVED,
      changedAt: '2026-07-16T00:00:00.000Z',
    });

    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('creates candidate notifications for followed company published jobs', async () => {
    const qb = mockInsertBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.createFollowedCompanyJobPublishedNotifications({
      jobId: 'job-1',
      jobTitle: 'Backend Engineer',
      companyId: 'company-1',
      companyName: 'NexHire',
      companyLogoUrl: 'https://cdn.nexhire.vn/logo.png',
      companyLogoDocumentId: 'logo-1',
      location: 'Ha Noi',
      candidateUserIds: ['user-1', 'user-2', 'user-1'],
    });

    expect(qb.values).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: 'user-1',
        dedupeKey: 'company-follow-job:user:user-1:job-1',
        senderType: NotificationSenderType.COMPANY,
        senderEntityId: 'company-1',
        senderName: 'NexHire',
        senderLogoUrl: 'https://cdn.nexhire.vn/logo.png',
        type: NotificationType.COMPANY_FOLLOWED_JOB_PUBLISHED,
      }),
      expect.objectContaining({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: 'user-2',
        dedupeKey: 'company-follow-job:user:user-2:job-1',
        type: NotificationType.COMPANY_FOLLOWED_JOB_PUBLISHED,
      }),
    ]);
  });

  it('creates admin notification when company enters pending review', async () => {
    const qb = mockInsertBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.createAdminCompanyReviewRequiredNotifications({
      companyId: 'company-1',
      ownerUserId: 'owner-1',
      companyName: 'NexHire',
      companyStatus: CompanyStatus.PENDING,
      previousCompanyStatus: CompanyStatus.REJECTED,
      changedAt: '2026-08-03T00:00:00.000Z',
    });

    expect(qb.values).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: 'admin-1',
        dedupeKey: 'admin-company-review:user:admin-1:company-1:PENDING:2026-08-03T00:00:00.000Z',
        type: NotificationType.ADMIN_COMPANY_REVIEW_REQUIRED,
        data: { companyId: 'company-1' },
      }),
    ]);
  });

  it('creates admin notification when job enters review queue', async () => {
    const qb = mockInsertBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.createAdminJobReviewRequiredNotifications({
      jobId: 'job-1',
      companyId: 'company-1',
      companyName: 'NexHire',
      title: 'Backend Engineer',
      status: 'NEEDS_REVIEW',
      version: 1,
    });

    expect(qb.values).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: 'admin-1',
        dedupeKey: 'admin-job-review:user:admin-1:job-1:1:NEEDS_REVIEW',
        type: NotificationType.ADMIN_JOB_REVIEW_REQUIRED,
        data: { jobId: 'job-1' },
      }),
    ]);
  });

  it('creates admin notification when job revision enters review queue', async () => {
    const qb = mockInsertBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.createAdminJobRevisionReviewRequiredNotifications({
      jobId: 'job-1',
      companyId: 'company-1',
      title: 'Backend Engineer',
      revisionId: 'revision-1',
      status: 'PENDING_REVIEW',
    });

    expect(qb.values).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: 'admin-1',
        dedupeKey: 'admin-job-revision-review:user:admin-1:revision-1:PENDING_REVIEW',
        type: NotificationType.ADMIN_JOB_REVISION_REVIEW_REQUIRED,
        data: { jobId: 'job-1', revisionId: 'revision-1' },
      }),
    ]);
  });

  it('creates company notification when admin reviews a job', async () => {
    const qb = mockInsertBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.createJobReviewResultChangedNotification({
      jobId: 'job-1',
      companyId: 'company-1',
      companyName: 'NexHire',
      title: 'Backend Engineer',
      status: 'PUBLISHED',
      decision: 'APPROVE',
      reason: null,
      reviewedByUserId: 'admin-1',
      reviewedAt: '2026-08-03T10:00:00.000Z',
      publishedAt: '2026-08-03T10:00:00.000Z',
    });

    expect(qb.values).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientType: NotificationRecipientType.COMPANY,
        recipientCompanyId: 'company-1',
        dedupeKey: 'job-review-result:company:company-1:job-1:PUBLISHED:2026-08-03T10:00:00.000Z',
        type: NotificationType.JOB_REVIEW_RESULT_CHANGED,
        data: expect.objectContaining({
          jobId: 'job-1',
          status: 'PUBLISHED',
          decision: 'APPROVE',
        }),
      }),
    ]);
  });

  it('creates company notification when admin reviews a job revision', async () => {
    const qb = mockInsertBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.createJobRevisionReviewResultChangedNotification({
      jobId: 'job-1',
      companyId: 'company-1',
      title: 'Backend Engineer',
      revisionId: 'revision-1',
      status: 'REJECTED',
      decision: 'REJECT',
      reason: 'Missing salary clarity',
      reviewedByUserId: 'admin-1',
      reviewedAt: '2026-08-03T10:00:00.000Z',
    });

    expect(qb.values).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientType: NotificationRecipientType.COMPANY,
        recipientCompanyId: 'company-1',
        dedupeKey:
          'job-revision-review-result:company:company-1:revision-1:REJECTED:2026-08-03T10:00:00.000Z',
        type: NotificationType.JOB_REVISION_REVIEW_RESULT_CHANGED,
        data: expect.objectContaining({
          jobId: 'job-1',
          revisionId: 'revision-1',
          status: 'REJECTED',
          decision: 'REJECT',
        }),
      }),
    ]);
  });

  it('creates user notification when admin changes user lifecycle status', async () => {
    const qb = mockInsertBuilder();
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.createUserLifecycleChangedNotification({
      userId: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Candidate One',
      roles: [UserRole.CANDIDATE],
      previousStatus: 'ACTIVE',
      status: 'BANNED',
      reason: 'Policy violation',
      changedByUserId: 'admin-1',
      changedAt: '2026-08-03T10:00:00.000Z',
    });

    expect(qb.values).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: 'user-1',
        dedupeKey: 'user-lifecycle:user:user-1:BANNED:2026-08-03T10:00:00.000Z',
        type: NotificationType.USER_LIFECYCLE_CHANGED,
        data: expect.objectContaining({
          userId: 'user-1',
          status: 'BANNED',
          previousStatus: 'ACTIVE',
          reason: 'Policy violation',
        }),
      }),
    ]);
  });

  it('scopes unread count to recruiter company', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(3),
    };
    repo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.unreadCount({
      id: 'recruiter-1',
      role: UserRole.RECRUITER,
      companyId: 'company-1',
    });

    expect(qb.where).toHaveBeenCalled();
    expect(qb.andWhere).toHaveBeenCalledWith('notification.readAt IS NULL');
    expect(result.count).toBe(3);
  });

  it('scopes unread count to admin user notifications', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(5),
    };
    repo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.unreadCount({
      id: 'admin-1',
      role: UserRole.ADMIN,
    });

    expect(qb.where).toHaveBeenCalled();
    expect(qb.andWhere).toHaveBeenCalledWith('notification.readAt IS NULL');
    expect(result.count).toBe(5);
  });

  it('marks all company notifications read with strict recipient type scope', async () => {
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    repo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.markAllRead({
      id: 'recruiter-1',
      role: UserRole.RECRUITER,
      companyId: 'company-1',
    });

    expect(qb.andWhere).toHaveBeenCalledWith('recipient_type = :recipientType', {
      recipientType: NotificationRecipientType.COMPANY,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('recipient_company_id = :companyId', {
      companyId: 'company-1',
    });
    expect(result.count).toBe(2);
  });

  it('marks all admin user notifications read with strict user scope', async () => {
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 4 }),
    };
    repo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.markAllRead({
      id: 'admin-1',
      role: UserRole.ADMIN,
    });

    expect(qb.andWhere).toHaveBeenCalledWith('recipient_type = :recipientType', {
      recipientType: NotificationRecipientType.USER,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('recipient_user_id = :userId', {
      userId: 'admin-1',
    });
    expect(result.count).toBe(4);
  });
});
