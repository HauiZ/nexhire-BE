import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EVENTS, QUEUES } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { CvParsingService, CvUploadedEventPayload } from '../../cv-parsing.service';

@Injectable()
export class CvUploadedEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CvUploadedEventsConsumer.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

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

    this.connection = connect([url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ consumer connected'));
    this.connection.on('disconnect', (event) =>
      this.logger.warn(`RabbitMQ consumer disconnected: ${event.err?.message}`),
    );

    this.channel = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(exchange, 'topic', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchange, EVENTS.CV_UPLOADED);
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
      this.channel.nack(message, false, false);
    }
  }

  private parsePayload(message: ConsumeMessage): CvUploadedEventPayload {
    const payload = JSON.parse(message.content.toString()) as CvUploadedEventPayload;
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
