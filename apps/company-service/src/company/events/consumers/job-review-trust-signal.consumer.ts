import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EVENTS, JobModerationRiskLevel, JobReviewDecision, QUEUES } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { CompanyService, JobReviewTrustSignalPayload } from '../../company.service';

@Injectable()
export class JobReviewTrustSignalConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobReviewTrustSignalConsumer.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(
    private readonly configService: ConfigService,
    private readonly companyService: CompanyService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('rabbitmq.url');
    const exchange = this.configService.get<string>('rabbitmq.exchange');
    const queueName = this.configService.get<string>(
      'companyService.queues.jobReviewTrustSignal',
      QUEUES.COMPANY_JOB_REVIEW_TRUST_SIGNAL,
    );

    if (!url || !exchange) {
      this.logger.warn('RabbitMQ config missing, job review trust consumer is disabled');
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
        await channel.bindQueue(queueName, exchange, EVENTS.JOB_REVIEW_TRUST_SIGNAL);
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
      await this.companyService.recordTrustSignal(this.parsePayload(message));
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process job review trust signal', error as Error);
      this.channel.nack(message, false, false);
    }
  }

  private parsePayload(message: ConsumeMessage): JobReviewTrustSignalPayload {
    const payload = JSON.parse(message.content.toString()) as JobReviewTrustSignalPayload;
    if (
      !payload.companyId ||
      !payload.jobId ||
      !payload.targetType ||
      !payload.targetId ||
      !payload.decision
    ) {
      throw new Error('Invalid job review trust signal payload');
    }
    if (!['JOB', 'REVISION'].includes(payload.targetType)) {
      throw new Error(`Invalid job review target type: ${payload.targetType}`);
    }
    if (!Object.values(JobReviewDecision).includes(payload.decision)) {
      throw new Error(`Invalid job review decision: ${payload.decision}`);
    }
    if (payload.riskLevel && !Object.values(JobModerationRiskLevel).includes(payload.riskLevel)) {
      throw new Error(`Invalid job risk level: ${payload.riskLevel}`);
    }
    return payload;
  }
}
