import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EVENTS } from '@nexhire/shared';
import { ChannelWrapper, connect } from 'amqp-connection-manager';
import { Channel, ConsumeMessage } from 'amqplib';
import {
  ApplicationService,
  CandidateProfileSnapshotChangedPayload,
  JobLifecyclePayload,
} from '../application.service';

@Injectable()
export class JobLifecycleEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobLifecycleEventsConsumer.name);
  private connection?: ReturnType<typeof connect>;
  private channel?: ChannelWrapper;

  constructor(
    private readonly configService: ConfigService,
    private readonly applicationService: ApplicationService,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>('rabbitmq.url');
    const exchange = this.configService.get<string>('rabbitmq.exchange', 'nexhire.events');
    const queueName = this.configService.get<string>(
      'applicationService.queues.jobLifecycle',
      'application.job-lifecycle',
    );
    if (!url) {
      this.logger.warn('RabbitMQ config missing, job lifecycle consumer is disabled');
      return;
    }

    this.connection = connect([url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ consumer connected'));
    this.connection.on('disconnect', (event) =>
      this.logger.warn(`RabbitMQ consumer disconnected: ${event.err?.message}`),
    );
    this.channel = this.connection.createChannel({
      setup: async (channel: Channel) => {
        await channel.assertExchange(exchange, 'topic', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchange, EVENTS.JOB_UNPUBLISHED);
        await channel.bindQueue(queueName, exchange, EVENTS.JOB_CLOSED);
        await channel.bindQueue(queueName, exchange, EVENTS.CANDIDATE_PROFILE_SNAPSHOT_CHANGED);
        await channel.consume(queueName, (message) => this.consume(message), { noAck: false });
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private async consume(message: ConsumeMessage | null): Promise<void> {
    if (!message || !this.channel) {
      return;
    }

    try {
      if (message.fields.routingKey === EVENTS.JOB_CLOSED) {
        const payload = this.parseJobPayload(message);
        await this.applicationService.handleJobClosed(payload);
      } else if (message.fields.routingKey === EVENTS.CANDIDATE_PROFILE_SNAPSHOT_CHANGED) {
        const payload = this.parseCandidatePayload(message);
        await this.applicationService.syncCandidateProfileSnapshot(payload);
      } else {
        const payload = this.parseJobPayload(message);
        await this.applicationService.handleJobUnpublished(payload);
      }
      this.channel.ack(message);
    } catch (error) {
      this.logger.error(`Failed to process job lifecycle event: ${(error as Error).message}`);
      this.channel.nack(message, false, false);
    }
  }

  private parseJobPayload(message: ConsumeMessage): JobLifecyclePayload {
    const payload = JSON.parse(message.content.toString()) as JobLifecyclePayload;
    if (!payload.jobId) {
      throw new Error('Invalid job lifecycle payload');
    }
    return payload;
  }

  private parseCandidatePayload(message: ConsumeMessage): CandidateProfileSnapshotChangedPayload {
    const payload = JSON.parse(
      message.content.toString(),
    ) as CandidateProfileSnapshotChangedPayload;
    if (!payload.candidateUserId) {
      throw new Error('Invalid candidate profile snapshot payload');
    }
    return payload;
  }
}
