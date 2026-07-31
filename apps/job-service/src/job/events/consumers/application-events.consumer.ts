import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { retryOrDeadLetter, setupReliableQueue } from '@nexhire/infra';
import { EVENTS, QUEUES, unwrapEventData } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { ApplicationSubmittedPayload, JobService } from '../../job.service';

@Injectable()
export class ApplicationEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApplicationEventsConsumer.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;
  private exchange?: string;
  private queueName?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly jobService: JobService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('rabbitmq.url');
    const exchange = this.configService.get<string>('rabbitmq.exchange');
    const queueName = this.configService.get<string>(
      'jobService.queues.applicationSubmitted',
      QUEUES.JOB_APPLICATION_SUBMITTED,
    );

    if (!url || !exchange) {
      this.logger.warn('RabbitMQ config missing, application event consumer is disabled');
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
          bindingKeys: [EVENTS.APPLICATION_SUBMITTED],
        });
        await channel.consume(queueName, (message) => this.consumeApplicationSubmitted(message), {
          noAck: false,
        });
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  private async consumeApplicationSubmitted(message: ConsumeMessage | null): Promise<void> {
    if (!message || !this.channel) {
      return;
    }

    try {
      const payload = unwrapEventData(
        JSON.parse(message.content.toString()) as ApplicationSubmittedPayload,
      );
      this.assertPayload(payload);
      await this.jobService.recordApplicationSubmitted(payload);
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process application submitted event', error as Error);
      await this.retryOrRequeue(message);
    }
  }

  private async retryOrRequeue(message: ConsumeMessage): Promise<void> {
    try {
      await retryOrDeadLetter(this.channel!, message, this.exchange!, this.queueName!);
    } catch (error) {
      this.logger.error('Failed to move application submitted event to retry/DLQ', error as Error);
      this.channel!.nack(message, false, true);
    }
  }

  private assertPayload(payload: ApplicationSubmittedPayload): void {
    if (!payload.applicationId || !payload.jobId || !payload.candidateId) {
      throw new Error('Invalid application submitted event payload');
    }
  }
}
