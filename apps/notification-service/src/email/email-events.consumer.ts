import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EVENTS } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EmailService } from './email.service';

type VerifyEmailEventPayload = {
  email: string;
  fullName: string | null;
  token: string;
  expiresAt: string;
};

type PasswordResetEventPayload = VerifyEmailEventPayload;

@Injectable()
export class EmailEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailEventsConsumer.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('rabbitmq.url');
    const exchange = this.configService.get<string>('rabbitmq.exchange');
    const queueName = this.configService.get<string>(
      'notificationService.queues.emailVerification',
      'notification.email.verification',
    );
    const passwordResetQueueName = this.configService.get<string>(
      'notificationService.queues.passwordReset',
      'notification.email.password-reset',
    );

    if (!url || !exchange) {
      this.logger.warn('RabbitMQ config missing, email event consumer is disabled');
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
        await channel.assertQueue(passwordResetQueueName, { durable: true });
        await channel.bindQueue(queueName, exchange, EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED);
        await channel.bindQueue(
          passwordResetQueueName,
          exchange,
          EVENTS.AUTH_PASSWORD_RESET_REQUESTED,
        );
        await channel.consume(queueName, (message) => this.consumeVerifyEmail(message), {
          noAck: false,
        });
        await channel.consume(
          passwordResetQueueName,
          (message) => this.consumePasswordResetEmail(message),
          {
            noAck: false,
          },
        );
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  private async consumeVerifyEmail(message: ConsumeMessage | null): Promise<void> {
    if (!message || !this.channel) {
      return;
    }

    try {
      const payload = JSON.parse(message.content.toString()) as VerifyEmailEventPayload;
      await this.emailService.sendVerifyEmail(payload);
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process verify-email event', error as Error);
      this.channel.nack(message, false, false);
    }
  }

  private async consumePasswordResetEmail(message: ConsumeMessage | null): Promise<void> {
    if (!message || !this.channel) {
      return;
    }

    try {
      const payload = JSON.parse(message.content.toString()) as PasswordResetEventPayload;
      await this.emailService.sendPasswordResetEmail(payload);
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process password-reset event', error as Error);
      this.channel.nack(message, false, false);
    }
  }
}
