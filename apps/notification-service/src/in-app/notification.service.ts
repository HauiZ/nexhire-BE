import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApplicationStage, AuthUser, CompanyStatus, ERROR_CODES, UserRole } from '@nexhire/shared';
import { Brackets, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NotificationResponseDto,
  UnreadNotificationCountDto,
} from './dto/notification-response.dto';
import { Notification } from './entities/notification.entity';
import {
  NotificationRecipientType,
  NotificationSenderType,
  NotificationType,
} from './entities/notification.enum';
import { AdminRecipientClientService } from './admin-recipient-client.service';

export interface ApplicationSubmittedNotificationPayload {
  applicationId: string;
  jobId: string;
  jobTitle?: string | null;
  companyId: string;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  candidateId: string;
  candidateUserId: string;
  candidateFullName?: string | null;
  candidateAvatarDocumentId?: string | null;
  submittedAt?: string;
}

export interface ApplicationStageChangedNotificationPayload {
  applicationId: string;
  jobId: string;
  jobTitle?: string | null;
  companyId: string;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  candidateId: string;
  candidateUserId: string;
  candidateFullName?: string | null;
  candidateAvatarDocumentId?: string | null;
  previousStatus: ApplicationStage;
  status: ApplicationStage;
  note?: string | null;
  changedAt?: string;
}

export interface ApplicationCvViewedNotificationPayload {
  applicationId: string;
  jobId: string;
  jobTitle?: string | null;
  companyId: string;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  companyLogoDocumentId?: string | null;
  candidateId: string;
  candidateUserId: string;
  candidateFullName?: string | null;
  candidateAvatarDocumentId?: string | null;
  viewedByUserId: string;
  viewedAt?: string;
}

export interface CompanyPostingSnapshotNotificationPayload {
  companyId: string;
  ownerUserId: string;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  companyStatus: CompanyStatus;
  previousCompanyStatus?: CompanyStatus;
  changedAt?: string;
}

export interface FollowedCompanyJobPublishedNotificationPayload {
  jobId: string;
  jobTitle: string;
  companyId: string;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  companyLogoDocumentId?: string | null;
  experienceLevel?: string;
  location?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  isSalaryVisible?: boolean;
  publishedAt?: string | null;
  candidateUserIds: string[];
}

export interface AdminCompanyReviewRequiredPayload {
  companyId: string;
  ownerUserId: string;
  companyName: string;
  companyLogoUrl?: string | null;
  companyLogoDocumentId?: string | null;
  companyStatus: CompanyStatus;
  previousCompanyStatus?: CompanyStatus;
  changedAt?: string;
}

export interface AdminJobReviewRequiredPayload {
  jobId: string;
  companyId: string;
  companyName?: string | null;
  title: string;
  status: string;
  version: number;
  riskScore?: number | null;
  riskLevel?: string | null;
  submittedAt?: string;
}

export interface AdminJobRevisionReviewRequiredPayload {
  jobId: string;
  companyId: string;
  title: string;
  revisionId: string;
  status: string;
  riskScore?: number | null;
  riskLevel?: string | null;
  submittedAt?: string;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly adminRecipientClient: AdminRecipientClientService,
  ) {}

  async list(user: AuthUser, query: NotificationQueryDto) {
    const qb = this.notificationRepo
      .createQueryBuilder('notification')
      .where(this.scopeWhere(user))
      .orderBy('notification.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    if (query.readStatus === 'READ') {
      qb.andWhere('notification.readAt IS NOT NULL');
    }
    if (query.readStatus === 'UNREAD') {
      qb.andWhere('notification.readAt IS NULL');
    }

    const [notifications, total] = await qb.getManyAndCount();
    return {
      data: notifications.map((notification) => this.mapNotification(notification)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async unreadCount(user: AuthUser): Promise<UnreadNotificationCountDto> {
    const count = await this.notificationRepo
      .createQueryBuilder('notification')
      .where(this.scopeWhere(user))
      .andWhere('notification.readAt IS NULL')
      .getCount();
    return { count };
  }

  async markRead(user: AuthUser, id: string): Promise<NotificationResponseDto> {
    const notification = await this.findScopedNotification(user, id);
    notification.readAt = notification.readAt ?? new Date();
    return this.mapNotification(await this.notificationRepo.save(notification));
  }

  async markAllRead(user: AuthUser): Promise<UnreadNotificationCountDto> {
    const now = new Date();
    const qb = this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: now })
      .where('read_at IS NULL');

    if (user.role === UserRole.CANDIDATE || user.role === UserRole.ADMIN) {
      qb.andWhere('recipient_type = :recipientType', {
        recipientType: NotificationRecipientType.USER,
      }).andWhere('recipient_user_id = :userId', { userId: user.id });
    } else if (user.role === UserRole.RECRUITER && user.companyId) {
      qb.andWhere('recipient_type = :recipientType', {
        recipientType: NotificationRecipientType.COMPANY,
      }).andWhere('recipient_company_id = :companyId', { companyId: user.companyId });
    } else {
      throw this.forbidden();
    }

    const result = await qb.execute();
    return { count: result.affected ?? 0 };
  }

  async createApplicationSubmittedNotifications(
    payload: ApplicationSubmittedNotificationPayload,
  ): Promise<void> {
    const jobTitle = payload.jobTitle ?? 'một vị trí tuyển dụng';
    const candidateName = payload.candidateFullName ?? 'Một ứng viên';
    await this.insertNotifications([
      this.notificationRepo.create({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: payload.candidateUserId,
        recipientCompanyId: null,
        dedupeKey: `application-submitted:user:${payload.applicationId}`,
        senderType: NotificationSenderType.COMPANY,
        senderEntityId: payload.companyId,
        senderName: payload.companyName ?? null,
        senderAvatarDocumentId: null,
        senderLogoUrl: payload.companyLogoUrl ?? null,
        type: NotificationType.APPLICATION_SUBMITTED,
        title: 'Ứng tuyển thành công',
        body: `Hồ sơ của bạn đã được gửi tới ${payload.companyName ?? 'công ty'} cho ${jobTitle}.`,
        data: this.applicationData(payload),
        readAt: null,
      }),
      this.notificationRepo.create({
        recipientType: NotificationRecipientType.COMPANY,
        recipientUserId: null,
        recipientCompanyId: payload.companyId,
        dedupeKey: `application-submitted:company:${payload.applicationId}`,
        senderType: NotificationSenderType.CANDIDATE,
        senderEntityId: payload.candidateId,
        senderName: payload.candidateFullName ?? null,
        senderAvatarDocumentId: payload.candidateAvatarDocumentId ?? null,
        senderLogoUrl: null,
        type: NotificationType.APPLICATION_SUBMITTED,
        title: 'Có hồ sơ ứng tuyển mới',
        body: `${candidateName} vừa ứng tuyển vào ${jobTitle}.`,
        data: this.applicationData(payload),
        readAt: null,
      }),
    ]);
  }

  async createApplicationStageChangedNotification(
    payload: ApplicationStageChangedNotificationPayload,
  ): Promise<void> {
    const message = this.stageMessage(payload.status, payload.companyName);
    if (!message) {
      return;
    }

    await this.insertNotifications([
      this.notificationRepo.create({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: payload.candidateUserId,
        recipientCompanyId: null,
        dedupeKey: `application-stage:user:${payload.applicationId}:${payload.status}:${payload.changedAt ?? 'unknown'}`,
        senderType: NotificationSenderType.COMPANY,
        senderEntityId: payload.companyId,
        senderName: payload.companyName ?? null,
        senderAvatarDocumentId: null,
        senderLogoUrl: payload.companyLogoUrl ?? null,
        type: NotificationType.APPLICATION_STAGE_CHANGED,
        title: message.title,
        body: message.body,
        data: this.applicationData(payload),
        readAt: null,
      }),
    ]);
  }

  async createApplicationCvViewedNotification(
    payload: ApplicationCvViewedNotificationPayload,
  ): Promise<void> {
    const jobTitle = payload.jobTitle ?? 'vị trí tuyển dụng';
    await this.insertNotifications([
      this.notificationRepo.create({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: payload.candidateUserId,
        recipientCompanyId: null,
        dedupeKey: `application-cv-viewed:user:${payload.applicationId}`,
        senderType: NotificationSenderType.COMPANY,
        senderEntityId: payload.companyId,
        senderName: payload.companyName ?? null,
        senderAvatarDocumentId: null,
        senderLogoUrl: payload.companyLogoUrl ?? null,
        type: NotificationType.APPLICATION_CV_VIEWED,
        title: 'Nhà tuyển dụng đã xem CV',
        body: `${payload.companyName ?? 'Nhà tuyển dụng'} đã xem CV của bạn cho ${jobTitle}.`,
        data: this.applicationData(payload),
        readAt: null,
      }),
    ]);
  }

  async createCompanyVerificationChangedNotification(
    payload: CompanyPostingSnapshotNotificationPayload,
  ): Promise<void> {
    if (payload.previousCompanyStatus && payload.previousCompanyStatus === payload.companyStatus) {
      return;
    }
    const message = this.companyStatusMessage(payload.companyStatus, payload.companyName);
    if (!message) {
      return;
    }

    await this.insertNotifications([
      this.notificationRepo.create({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: payload.ownerUserId,
        recipientCompanyId: null,
        dedupeKey: `company-status:user:${payload.companyId}:${payload.companyStatus}:${payload.changedAt ?? 'unknown'}`,
        senderType: NotificationSenderType.SYSTEM,
        senderEntityId: null,
        senderName: 'NexHire',
        senderAvatarDocumentId: null,
        senderLogoUrl: null,
        type: NotificationType.COMPANY_VERIFICATION_CHANGED,
        title: message.title,
        body: message.body,
        data: {
          companyId: payload.companyId,
          companyName: payload.companyName ?? null,
          companyLogoUrl: payload.companyLogoUrl ?? null,
          companyStatus: payload.companyStatus,
        },
        readAt: null,
      }),
    ]);
  }

  async createFollowedCompanyJobPublishedNotifications(
    payload: FollowedCompanyJobPublishedNotificationPayload,
  ): Promise<void> {
    const companyName = payload.companyName ?? 'A company you follow';
    const notifications = [...new Set(payload.candidateUserIds)].map((candidateUserId) =>
      this.notificationRepo.create({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: candidateUserId,
        recipientCompanyId: null,
        dedupeKey: `company-follow-job:user:${candidateUserId}:${payload.jobId}`,
        senderType: NotificationSenderType.COMPANY,
        senderEntityId: payload.companyId,
        senderName: payload.companyName ?? null,
        senderAvatarDocumentId: null,
        senderLogoUrl: payload.companyLogoUrl ?? null,
        type: NotificationType.COMPANY_FOLLOWED_JOB_PUBLISHED,
        title: 'New job from followed company',
        body: `${companyName} just published ${payload.jobTitle}.`,
        data: {
          jobId: payload.jobId,
          jobTitle: payload.jobTitle,
          companyId: payload.companyId,
          companyName: payload.companyName ?? null,
          companyLogoUrl: payload.companyLogoUrl ?? null,
          companyLogoDocumentId: payload.companyLogoDocumentId ?? null,
          experienceLevel: payload.experienceLevel ?? null,
          location: payload.location ?? null,
          salaryMin: payload.salaryMin ?? null,
          salaryMax: payload.salaryMax ?? null,
          salaryCurrency: payload.salaryCurrency ?? null,
          isSalaryVisible: payload.isSalaryVisible ?? null,
          publishedAt: payload.publishedAt ?? null,
        },
        readAt: null,
      }),
    );

    await this.insertNotifications(notifications);
  }

  async createAdminCompanyReviewRequiredNotifications(
    payload: AdminCompanyReviewRequiredPayload,
  ): Promise<void> {
    if (
      payload.companyStatus !== CompanyStatus.PENDING ||
      payload.previousCompanyStatus === CompanyStatus.PENDING
    ) {
      return;
    }
    const admins = await this.adminRecipientClient.listAdminRecipients();
    const notifications = admins.map((admin) =>
      this.notificationRepo.create({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: admin.id,
        recipientCompanyId: null,
        dedupeKey: `admin-company-review:user:${admin.id}:${payload.companyId}:${payload.companyStatus}:${payload.changedAt ?? 'unknown'}`,
        senderType: NotificationSenderType.SYSTEM,
        senderEntityId: null,
        senderName: 'NexHire',
        senderAvatarDocumentId: null,
        senderLogoUrl: null,
        type: NotificationType.ADMIN_COMPANY_REVIEW_REQUIRED,
        title: 'Company review required',
        body: `${payload.companyName ?? 'A company'} is waiting for verification review.`,
        data: {
          companyId: payload.companyId,
        },
        readAt: null,
      }),
    );
    await this.insertNotifications(notifications);
  }

  async createAdminJobReviewRequiredNotifications(
    payload: AdminJobReviewRequiredPayload,
  ): Promise<void> {
    const admins = await this.adminRecipientClient.listAdminRecipients();
    const notifications = admins.map((admin) =>
      this.notificationRepo.create({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: admin.id,
        recipientCompanyId: null,
        dedupeKey: `admin-job-review:user:${admin.id}:${payload.jobId}:${payload.version}:${payload.status}`,
        senderType: NotificationSenderType.SYSTEM,
        senderEntityId: null,
        senderName: 'NexHire',
        senderAvatarDocumentId: null,
        senderLogoUrl: null,
        type: NotificationType.ADMIN_JOB_REVIEW_REQUIRED,
        title: 'Job review required',
        body: `${payload.title} is waiting for admin review.`,
        data: {
          jobId: payload.jobId,
        },
        readAt: null,
      }),
    );
    await this.insertNotifications(notifications);
  }

  async createAdminJobRevisionReviewRequiredNotifications(
    payload: AdminJobRevisionReviewRequiredPayload,
  ): Promise<void> {
    const admins = await this.adminRecipientClient.listAdminRecipients();
    const notifications = admins.map((admin) =>
      this.notificationRepo.create({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: admin.id,
        recipientCompanyId: null,
        dedupeKey: `admin-job-revision-review:user:${admin.id}:${payload.revisionId}:${payload.status}`,
        senderType: NotificationSenderType.SYSTEM,
        senderEntityId: null,
        senderName: 'NexHire',
        senderAvatarDocumentId: null,
        senderLogoUrl: null,
        type: NotificationType.ADMIN_JOB_REVISION_REVIEW_REQUIRED,
        title: 'Job revision review required',
        body: `${payload.title} has a revision waiting for admin review.`,
        data: {
          jobId: payload.jobId,
          revisionId: payload.revisionId,
        },
        readAt: null,
      }),
    );
    await this.insertNotifications(notifications);
  }

  private async findScopedNotification(user: AuthUser, id: string): Promise<Notification> {
    const notification = await this.notificationRepo
      .createQueryBuilder('notification')
      .where('notification.id = :id', { id })
      .andWhere(this.scopeWhere(user))
      .getOne();
    if (!notification) {
      throw new NotFoundException({
        code: ERROR_CODES.COMMON.NOT_FOUND,
        message: 'Notification not found',
      });
    }
    return notification;
  }

  private scopeWhere(user: AuthUser): Brackets {
    return new Brackets((where) => {
      if (user.role === UserRole.CANDIDATE || user.role === UserRole.ADMIN) {
        where
          .where('notification.recipientType = :recipientType', {
            recipientType: NotificationRecipientType.USER,
          })
          .andWhere('notification.recipientUserId = :userId', { userId: user.id });
        return;
      }
      if (user.role === UserRole.RECRUITER && user.companyId) {
        where
          .where('notification.recipientType = :recipientType', {
            recipientType: NotificationRecipientType.COMPANY,
          })
          .andWhere('notification.recipientCompanyId = :companyId', {
            companyId: user.companyId,
          });
        return;
      }
      throw this.forbidden();
    });
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: ERROR_CODES.COMMON.FORBIDDEN,
      message: 'Notifications are only available to candidates, recruiters, and admins',
    });
  }

  private stageMessage(
    status: ApplicationStage,
    companyName?: string | null,
  ): { title: string; body: string } | null {
    if (status === ApplicationStage.OFFERED) {
      return {
        title: 'Hồ sơ được quan tâm',
        body: `${companyName ?? 'Nhà tuyển dụng'} đã quan tâm hồ sơ của bạn. Vui lòng chờ email hoặc liên hệ phỏng vấn.`,
      };
    }
    if (status === ApplicationStage.REJECTED) {
      return {
        title: 'Hồ sơ chưa phù hợp',
        body: `${companyName ?? 'Nhà tuyển dụng'} đã cập nhật kết quả hồ sơ của bạn.`,
      };
    }
    if (status === ApplicationStage.CANCELLED) {
      return {
        title: 'Tin tuyển dụng đã đóng',
        body: `Hồ sơ của bạn đã được hủy vì tin tuyển dụng không còn nhận xử lý.`,
      };
    }
    return null;
  }

  private companyStatusMessage(
    status: CompanyStatus,
    companyName?: string | null,
  ): { title: string; body: string } | null {
    const name = companyName ?? 'Your company';
    if (status === CompanyStatus.APPROVED) {
      return {
        title: 'Company approved',
        body: `${name} has been approved. You can now submit jobs for review.`,
      };
    }
    if (status === CompanyStatus.REJECTED) {
      return {
        title: 'Company rejected',
        body: `${name} was not approved. Please update the company profile and submit again.`,
      };
    }
    if (status === CompanyStatus.SUSPENDED) {
      return {
        title: 'Company suspended',
        body: `${name} has been suspended. Public posting is temporarily disabled.`,
      };
    }
    if (status === CompanyStatus.PENDING) {
      return {
        title: 'Company pending review',
        body: `${name} is waiting for admin review before posting jobs.`,
      };
    }
    return null;
  }

  private applicationData(
    payload:
      | ApplicationSubmittedNotificationPayload
      | ApplicationStageChangedNotificationPayload
      | ApplicationCvViewedNotificationPayload,
  ): Record<string, unknown> {
    return {
      applicationId: payload.applicationId,
      jobId: payload.jobId,
      jobTitle: payload.jobTitle ?? null,
      companyId: payload.companyId,
      companyName: payload.companyName ?? null,
      companyLogoUrl: payload.companyLogoUrl ?? null,
      candidateId: payload.candidateId,
      candidateUserId: payload.candidateUserId,
      candidateFullName: payload.candidateFullName ?? null,
      candidateAvatarDocumentId: payload.candidateAvatarDocumentId ?? null,
      ...('status' in payload
        ? {
            previousStatus: payload.previousStatus,
            status: payload.status,
            note: payload.note ?? null,
          }
        : {}),
      ...('viewedByUserId' in payload
        ? {
            viewedByUserId: payload.viewedByUserId,
            viewedAt: payload.viewedAt ?? null,
          }
        : {}),
    };
  }

  private async insertNotifications(notifications: Notification[]): Promise<void> {
    if (notifications.length === 0) {
      return;
    }
    await this.notificationRepo
      .createQueryBuilder()
      .insert()
      .into(Notification)
      .values(notifications as QueryDeepPartialEntity<Notification>[])
      .orIgnore()
      .execute();
  }

  private mapNotification(notification: Notification): NotificationResponseDto {
    return {
      id: notification.id,
      recipientType: notification.recipientType,
      recipientUserId: notification.recipientUserId,
      recipientCompanyId: notification.recipientCompanyId,
      senderType: notification.senderType,
      senderEntityId: notification.senderEntityId,
      senderName: notification.senderName,
      senderAvatarDocumentId: notification.senderAvatarDocumentId,
      senderLogoUrl: notification.senderLogoUrl,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }
}
