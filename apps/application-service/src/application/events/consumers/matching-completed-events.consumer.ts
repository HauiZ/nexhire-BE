import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { retryOrDeadLetter, setupReliableQueue } from '@nexhire/infra';
import { EVENTS, QUEUES, unwrapEventData } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { ApplicationService } from '../../application.service';

interface MatchingCompletedPayload {
  applicationId?: string | null;
  totalScore: number;
  matchLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXCELLENT';
}

@Injectable()
export class MatchingCompletedEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchingCompletedEventsConsumer.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;
  private exchange?: string;
  private queueName?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly applicationService: ApplicationService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('rabbitmq.url');
    const exchange = this.configService.get<string>('rabbitmq.exchange');
    const queueName = this.configService.get<string>(
      'applicationService.queues.matchingCompleted',
      QUEUES.APPLICATION_MATCHING_COMPLETED,
    );

    if (!url || !exchange) {
      this.logger.warn('RabbitMQ config missing, matching completed consumer is disabled');
      return;
    }

    this.exchange = exchange;
    this.queueName = queueName;
    this.connection = connect([url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ matching consumer connected'));
    this.connection.on('disconnect', (event) =>
      this.logger.warn(`RabbitMQ matching consumer disconnected: ${event.err?.message}`),
    );

    this.channel = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await setupReliableQueue(channel, {
          exchange,
          queueName,
          bindingKeys: [EVENTS.MATCHING_COMPLETED],
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
      const payload = this.parsePayload(message);
      if (!payload.applicationId) {
        this.logger.warn('Ignoring matching.completed without applicationId');
        this.channel.ack(message);
        return;
      }
      await this.applicationService.updateMatchSnapshot(payload.applicationId, {
        matchScore: payload.totalScore,
        matchLevel: payload.matchLevel,
      });
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process matching completed event', error as Error);
      await this.retryOrRequeue(message);
    }
  }

  private async retryOrRequeue(message: ConsumeMessage): Promise<void> {
    try {
      await retryOrDeadLetter(this.channel!, message, this.exchange!, this.queueName!);
    } catch (error) {
      this.logger.error('Failed to move matching completed event to retry/DLQ', error as Error);
      this.channel!.nack(message, false, true);
    }
  }

  private parsePayload(message: ConsumeMessage): MatchingCompletedPayload {
    const payload = unwrapEventData(
      JSON.parse(message.content.toString()) as MatchingCompletedPayload,
    );
    if (typeof payload.totalScore !== 'number') {
      throw new Error('Invalid matching.completed payload');
    }
    return payload;
  }
}
