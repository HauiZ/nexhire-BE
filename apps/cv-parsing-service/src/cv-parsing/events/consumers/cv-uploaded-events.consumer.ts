import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { retryOrDeadLetter, setupReliableQueue } from '@nexhire/infra';
import { EVENTS, QUEUES, unwrapEventData } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { CvParsingService, CvUploadedEventPayload } from '../../cv-parsing.service';

@Injectable()
export class CvUploadedEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CvUploadedEventsConsumer.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;
  private exchange?: string;
  private queueName?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly cvParsingService: CvParsingService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('rabbitmq.url');
    const exchange = this.configService.get<string>('rabbitmq.exchange');
    const queueName = this.configService.get<string>(
      'cvParsingService.queues.cvUploaded',
      QUEUES.CV_PARSING_CV_UPLOADED,
    );

    if (!url || !exchange) {
      this.logger.warn('RabbitMQ config missing, CV uploaded consumer is disabled');
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
          bindingKeys: [EVENTS.CV_UPLOADED],
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
      await this.cvParsingService.processUploadedCv(payload);
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process CV uploaded event', error as Error);
      await this.retryOrRequeue(message);
    }
  }

  private async retryOrRequeue(message: ConsumeMessage): Promise<void> {
    try {
      await retryOrDeadLetter(this.channel!, message, this.exchange!, this.queueName!);
    } catch (error) {
      this.logger.error('Failed to move CV uploaded event to retry/DLQ', error as Error);
      this.channel!.nack(message, false, true);
    }
  }

  private parsePayload(message: ConsumeMessage): CvUploadedEventPayload {
    const payload = unwrapEventData(
      JSON.parse(message.content.toString()) as CvUploadedEventPayload,
    );
    if (
      !payload.candidateId ||
      !payload.candidateUserId ||
      !payload.candidateCvId ||
      !payload.documentId ||
      !payload.documentUrl
    ) {
      throw new Error('Invalid CV uploaded payload');
    }
    return payload;
  }
}
