import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { retryOrDeadLetter, setupReliableQueue } from '@nexhire/infra';
import { EVENTS, ParsedResume, QUEUES, unwrapEventData } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { ApplicationService } from '../../application.service';

interface CvParsedPayload {
  candidateCvId: string;
  normalizedPayload: ParsedResume;
}

@Injectable()
export class CvParsedEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CvParsedEventsConsumer.name);
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
      'applicationService.queues.cvParsed',
      QUEUES.APPLICATION_CV_PARSED,
    );

    if (!url || !exchange) {
      this.logger.warn('RabbitMQ config missing, CV parsed matching consumer is disabled');
      return;
    }

    this.exchange = exchange;
    this.queueName = queueName;
    this.connection = connect([url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ CV parsed consumer connected'));
    this.connection.on('disconnect', (event) =>
      this.logger.warn(`RabbitMQ CV parsed consumer disconnected: ${event.err?.message}`),
    );

    this.channel = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await setupReliableQueue(channel, {
          exchange,
          queueName,
          bindingKeys: [EVENTS.CV_PARSED],
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
      await this.applicationService.handleCvParsedForMatching(payload);
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process CV parsed matching event', error as Error);
      await this.retryOrRequeue(message);
    }
  }

  private async retryOrRequeue(message: ConsumeMessage): Promise<void> {
    try {
      await retryOrDeadLetter(this.channel!, message, this.exchange!, this.queueName!);
    } catch (error) {
      this.logger.error('Failed to move CV parsed event to retry/DLQ', error as Error);
      this.channel!.nack(message, false, true);
    }
  }

  private parsePayload(message: ConsumeMessage): CvParsedPayload {
    const payload = unwrapEventData(JSON.parse(message.content.toString()) as CvParsedPayload);
    if (!payload.candidateCvId || !payload.normalizedPayload) {
      throw new Error('Invalid cv.parsed payload');
    }
    return payload;
  }
}
