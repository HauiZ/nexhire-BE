import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EVENTS } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
  ApplicationStageChangedNotificationPayload,
  ApplicationSubmittedNotificationPayload,
  NotificationService,
} from './notification.service';

@Injectable()
export class NotificationEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationEventsConsumer.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('rabbitmq.url');
    const exchange = this.configService.get<string>('rabbitmq.exchange');
    const queueName = this.configService.get<string>(
      'notificationService.queues.inAppApplication',
      'notification.in-app.application',
    );

    if (!url || !exchange) {
      this.logger.warn('RabbitMQ config missing, in-app notification consumer is disabled');
      return;
    }

    this.connection = connect([url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ consumer connected'));
    this.connection.on('disconnect', (event) =>
      this.logger.warn(`RabbitMQ consumer disconnected: ${event.err?.message}`),
    );

    this.channel = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(exchange, 'topic', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchange, EVENTS.APPLICATION_SUBMITTED);
        await channel.bindQueue(queueName, exchange, EVENTS.APPLICATION_STAGE_CHANGED);
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
      } else {
        await this.notificationService.createApplicationStageChangedNotification(
          this.parseStageChangedPayload(message),
        );
      }
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process in-app notification event', error as Error);
      this.channel.nack(message, false, false);
    }
  }

  private parseSubmittedPayload(message: ConsumeMessage): ApplicationSubmittedNotificationPayload {
    const payload = JSON.parse(
      message.content.toString(),
    ) as ApplicationSubmittedNotificationPayload;
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
    if (
      !payload.applicationId ||
      !payload.companyId ||
      !payload.candidateUserId ||
      !payload.status
    ) {
      throw new Error('Invalid application stage changed notification payload');
    }
    return payload;
  }
}
