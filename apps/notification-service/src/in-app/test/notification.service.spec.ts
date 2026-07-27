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

  beforeEach(() => {
    repo = {
      create: jest.fn((payload: Partial<Notification>) => payload),
      save: jest.fn((payload: unknown) => Promise.resolve(payload)),
      createQueryBuilder: jest.fn(),
    };
    service = new NotificationService(repo as unknown as Repository<Notification>);
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
});
