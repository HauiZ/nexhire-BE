import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { retryOrDeadLetter, setupReliableQueue } from '@nexhire/infra';
import { EVENTS, QUEUES, unwrapEventData } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
  ApplicationStageChangedNotificationPayload,
  ApplicationCvViewedNotificationPayload,
  ApplicationSubmittedNotificationPayload,
  AdminCompanyReviewRequiredPayload,
  AdminJobReviewRequiredPayload,
  AdminJobRevisionReviewRequiredPayload,
  CompanyPostingSnapshotNotificationPayload,
  FollowedCompanyJobPublishedNotificationPayload,
  JobReviewResultChangedNotificationPayload,
  JobRevisionReviewResultChangedNotificationPayload,
  NotificationService,
  UserLifecycleChangedNotificationPayload,
} from './notification.service';

@Injectable()
export class NotificationEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationEventsConsumer.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;
  private exchange?: string;
  private queueName?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('rabbitmq.url');
    const exchange = this.configService.get<string>('rabbitmq.exchange');
    const queueName = this.configService.get<string>(
      'notificationService.queues.inAppApplication',
      QUEUES.NOTIFICATION_IN_APP,
    );

    if (!url || !exchange) {
      this.logger.warn('RabbitMQ config missing, in-app notification consumer is disabled');
      return;
    }

    this.exchange = exchange;
    this.queueName = queueName;
    this.connection = connect([url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ consumer connected'));
    this.connection.on('disconnect', (event) =>
      this.logger.warn(`RabbitMQ consumer disconnected: ${event.err?.message}`),
    );

    this.channel = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await setupReliableQueue(channel, {
          exchange,
          queueName,
          bindingKeys: [
            EVENTS.APPLICATION_SUBMITTED,
            EVENTS.APPLICATION_STAGE_CHANGED,
            EVENTS.APPLICATION_CV_VIEWED,
            EVENTS.COMPANY_POSTING_SNAPSHOT_CHANGED,
            EVENTS.COMPANY_REVIEW_REQUIRED,
            EVENTS.JOB_REVIEW_REQUIRED,
            EVENTS.JOB_REVIEW_RESULT_CHANGED,
            EVENTS.JOB_REVISION_REVIEW_REQUIRED,
            EVENTS.JOB_REVISION_REVIEW_RESULT_CHANGED,
            EVENTS.COMPANY_FOLLOWED_JOB_PUBLISHED,
            EVENTS.USER_LIFECYCLE_CHANGED,
          ],
        });
        await channel.consume(queueName, (message) => this.consume(message), { noAck: false });
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  private async consume(message: ConsumeMessage | null): Promise<void> {
    if (!message || !this.channel) {
      return;
    }

    try {
      if (message.fields.routingKey === EVENTS.APPLICATION_SUBMITTED) {
        await this.notificationService.createApplicationSubmittedNotifications(
          this.parseSubmittedPayload(message),
        );
      } else if (message.fields.routingKey === EVENTS.APPLICATION_STAGE_CHANGED) {
        await this.notificationService.createApplicationStageChangedNotification(
          this.parseStageChangedPayload(message),
        );
      } else if (message.fields.routingKey === EVENTS.APPLICATION_CV_VIEWED) {
        await this.notificationService.createApplicationCvViewedNotification(
          this.parseCvViewedPayload(message),
        );
      } else if (message.fields.routingKey === EVENTS.COMPANY_POSTING_SNAPSHOT_CHANGED) {
        await this.notificationService.createCompanyVerificationChangedNotification(
          this.parseCompanySnapshotPayload(message),
        );
      } else if (message.fields.routingKey === EVENTS.COMPANY_REVIEW_REQUIRED) {
        await this.notificationService.createAdminCompanyReviewRequiredNotifications(
          this.parseAdminCompanyReviewPayload(message),
        );
      } else if (message.fields.routingKey === EVENTS.JOB_REVIEW_REQUIRED) {
        await this.notificationService.createAdminJobReviewRequiredNotifications(
          this.parseAdminJobReviewPayload(message),
        );
      } else if (message.fields.routingKey === EVENTS.JOB_REVIEW_RESULT_CHANGED) {
        await this.notificationService.createJobReviewResultChangedNotification(
          this.parseJobReviewResultPayload(message),
        );
      } else if (message.fields.routingKey === EVENTS.JOB_REVISION_REVIEW_REQUIRED) {
        await this.notificationService.createAdminJobRevisionReviewRequiredNotifications(
          this.parseAdminJobRevisionReviewPayload(message),
        );
      } else if (message.fields.routingKey === EVENTS.JOB_REVISION_REVIEW_RESULT_CHANGED) {
        await this.notificationService.createJobRevisionReviewResultChangedNotification(
          this.parseJobRevisionReviewResultPayload(message),
        );
      } else if (message.fields.routingKey === EVENTS.COMPANY_FOLLOWED_JOB_PUBLISHED) {
        await this.notificationService.createFollowedCompanyJobPublishedNotifications(
          this.parseFollowedCompanyJobPayload(message),
        );
      } else if (message.fields.routingKey === EVENTS.USER_LIFECYCLE_CHANGED) {
        await this.notificationService.createUserLifecycleChangedNotification(
          this.parseUserLifecyclePayload(message),
        );
      }
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process in-app notification event', error as Error);
      await this.retryOrRequeue(message);
    }
  }

  private async retryOrRequeue(message: ConsumeMessage): Promise<void> {
    try {
      await retryOrDeadLetter(this.channel!, message, this.exchange!, this.queueName!);
    } catch (error) {
      this.logger.error('Failed to move in-app notification event to retry/DLQ', error as Error);
      this.channel!.nack(message, false, true);
    }
  }

  private parseSubmittedPayload(message: ConsumeMessage): ApplicationSubmittedNotificationPayload {
    const payload = unwrapEventData(
      JSON.parse(message.content.toString()) as ApplicationSubmittedNotificationPayload,
    );
    if (!payload.applicationId || !payload.companyId || !payload.candidateUserId) {
      throw new Error('Invalid application submitted notification payload');
    }
    return payload;
  }

  private parseStageChangedPayload(
    message: ConsumeMessage,
  ): ApplicationStageChangedNotificationPayload {
    const payload = JSON.parse(
      message.content.toString(),
    ) as ApplicationStageChangedNotificationPayload;
    const data = unwrapEventData(payload);
    if (!data.applicationId || !data.companyId || !data.candidateUserId || !data.status) {
      throw new Error('Invalid application stage changed notification payload');
    }
    return data;
  }

  private parseCvViewedPayload(message: ConsumeMessage): ApplicationCvViewedNotificationPayload {
    const payload = unwrapEventData(
      JSON.parse(message.content.toString()) as ApplicationCvViewedNotificationPayload,
    );
    if (
      !payload.applicationId ||
      !payload.companyId ||
      !payload.candidateUserId ||
      !payload.viewedByUserId
    ) {
      throw new Error('Invalid application CV viewed notification payload');
    }
    return payload;
  }

  private parseCompanySnapshotPayload(
    message: ConsumeMessage,
  ): CompanyPostingSnapshotNotificationPayload {
    const payload = unwrapEventData(
      JSON.parse(message.content.toString()) as CompanyPostingSnapshotNotificationPayload,
    );
    if (!payload.companyId || !payload.ownerUserId || !payload.companyStatus) {
      throw new Error('Invalid company snapshot notification payload');
    }
    return payload;
  }

  private parseAdminCompanyReviewPayload(
    message: ConsumeMessage,
  ): AdminCompanyReviewRequiredPayload {
    const payload = unwrapEventData(
      JSON.parse(message.content.toString()) as AdminCompanyReviewRequiredPayload,
    );
    if (!payload.companyId || !payload.ownerUserId || !payload.companyStatus) {
      throw new Error('Invalid admin company review notification payload');
    }
    return payload;
  }

  private parseAdminJobReviewPayload(message: ConsumeMessage): AdminJobReviewRequiredPayload {
    const payload = unwrapEventData(
      JSON.parse(message.content.toString()) as AdminJobReviewRequiredPayload,
    );
    if (!payload.jobId || !payload.companyId || !payload.title || !payload.status) {
      throw new Error('Invalid admin job review notification payload');
    }
    return payload;
  }

  private parseAdminJobRevisionReviewPayload(
    message: ConsumeMessage,
  ): AdminJobRevisionReviewRequiredPayload {
    const payload = unwrapEventData(
      JSON.parse(message.content.toString()) as AdminJobRevisionReviewRequiredPayload,
    );
    if (
      !payload.jobId ||
      !payload.companyId ||
      !payload.revisionId ||
      !payload.title ||
      !payload.status
    ) {
      throw new Error('Invalid admin job revision review notification payload');
    }
    return payload;
  }

  private parseJobReviewResultPayload(
    message: ConsumeMessage,
  ): JobReviewResultChangedNotificationPayload {
    const payload = unwrapEventData(
      JSON.parse(message.content.toString()) as JobReviewResultChangedNotificationPayload,
    );
    if (!payload.jobId || !payload.companyId || !payload.title || !payload.status) {
      throw new Error('Invalid job review result notification payload');
    }
    return payload;
  }

  private parseJobRevisionReviewResultPayload(
    message: ConsumeMessage,
  ): JobRevisionReviewResultChangedNotificationPayload {
    const payload = unwrapEventData(
      JSON.parse(message.content.toString()) as JobRevisionReviewResultChangedNotificationPayload,
    );
    if (
      !payload.jobId ||
      !payload.companyId ||
      !payload.revisionId ||
      !payload.title ||
      !payload.status
    ) {
      throw new Error('Invalid job revision review result notification payload');
    }
    return payload;
  }

  private parseFollowedCompanyJobPayload(
    message: ConsumeMessage,
  ): FollowedCompanyJobPublishedNotificationPayload {
    const payload = unwrapEventData(
      JSON.parse(message.content.toString()) as FollowedCompanyJobPublishedNotificationPayload,
    );
    if (
      !payload.jobId ||
      !payload.jobTitle ||
      !payload.companyId ||
      !Array.isArray(payload.candidateUserIds)
    ) {
      throw new Error('Invalid followed company job notification payload');
    }
    return payload;
  }

  private parseUserLifecyclePayload(
    message: ConsumeMessage,
  ): UserLifecycleChangedNotificationPayload {
    const payload = unwrapEventData(
      JSON.parse(message.content.toString()) as UserLifecycleChangedNotificationPayload,
    );
    if (!payload.userId || !payload.email || !payload.status || !payload.changedByUserId) {
      throw new Error('Invalid user lifecycle notification payload');
    }
    return payload;
  }
}
