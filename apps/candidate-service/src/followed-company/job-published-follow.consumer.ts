import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EVENTS, QUEUES } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { FollowedCompanyService } from './followed-company.service';

interface JobPublishedPayload {
  jobId: string;
  companyId: string;
  version: number;
  publishedAt?: string;
}

@Injectable()
export class JobPublishedFollowConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobPublishedFollowConsumer.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(
    private readonly configService: ConfigService,
    private readonly followedCompanyService: FollowedCompanyService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('rabbitmq.url');
    const exchange = this.configService.get<string>('rabbitmq.exchange');

    if (!url || !exchange) {
      this.logger.warn('RabbitMQ config missing, followed company consumer is disabled');
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
        await channel.assertQueue(QUEUES.CANDIDATE_JOB_PUBLISHED_FOLLOW, { durable: true });
        await channel.bindQueue(
          QUEUES.CANDIDATE_JOB_PUBLISHED_FOLLOW,
          exchange,
          EVENTS.JOB_PUBLISHED,
        );
        await channel.consume(QUEUES.CANDIDATE_JOB_PUBLISHED_FOLLOW, (message) =>
          this.consume(message),
        );
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
      const payload = this.parsePayload(message);
      await this.followedCompanyService.notifyFollowersAboutPublishedJob(payload);
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process followed company job event', error as Error);
      this.channel.nack(message, false, false);
    }
  }

  private parsePayload(message: ConsumeMessage): JobPublishedPayload {
    const payload = JSON.parse(message.content.toString()) as JobPublishedPayload;
    if (!payload.jobId || !payload.companyId) {
      throw new Error('Invalid job published payload');
    }
    return payload;
  }
}
