import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EVENTS, QUEUES } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { CompanyStatusSnapshot, CompanyTrustLevel } from '../../entities/job.enum';
import { CompanyPostingSnapshotChangedPayload, JobService } from '../../job.service';

@Injectable()
export class CompanySnapshotEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompanySnapshotEventsConsumer.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(
    private readonly configService: ConfigService,
    private readonly jobService: JobService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('rabbitmq.url');
    const exchange = this.configService.get<string>('rabbitmq.exchange');
    const queueName = this.configService.get<string>(
      'jobService.queues.companySnapshot',
      QUEUES.JOB_COMPANY_SNAPSHOT,
    );

    if (!url || !exchange) {
      this.logger.warn('RabbitMQ config missing, company snapshot consumer is disabled');
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
        await channel.bindQueue(queueName, exchange, EVENTS.COMPANY_POSTING_SNAPSHOT_CHANGED);
        await channel.consume(queueName, (message) => this.consumeSnapshotChanged(message), {
          noAck: false,
        });
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  private async consumeSnapshotChanged(message: ConsumeMessage | null): Promise<void> {
    if (!message || !this.channel) {
      return;
    }

    try {
      const payload = JSON.parse(
        message.content.toString(),
      ) as CompanyPostingSnapshotChangedPayload;
      this.assertPayload(payload);
      await this.jobService.syncCompanyPostingSnapshot(payload);
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process company snapshot event', error as Error);
      this.channel.nack(message, false, false);
    }
  }

  private assertPayload(payload: CompanyPostingSnapshotChangedPayload): void {
    if (!payload.companyId || !payload.companyStatus) {
      throw new Error('Invalid company snapshot event payload');
    }
    if (!Object.values(CompanyStatusSnapshot).includes(payload.companyStatus)) {
      throw new Error(`Invalid company status: ${payload.companyStatus}`);
    }
    if (
      payload.companyTrustLevel &&
      !Object.values(CompanyTrustLevel).includes(payload.companyTrustLevel)
    ) {
      throw new Error(`Invalid company trust level: ${payload.companyTrustLevel}`);
    }
  }
}
