import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EVENTS, ParsedResume, QUEUES } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { CandidateService } from '../../candidate.service';

interface CvParsedPayload {
  candidateId: string;
  candidateCvId: string;
  normalizedPayload: ParsedResume;
}

interface CvParseFailedPayload {
  candidateId: string;
  candidateCvId: string;
  errorMessage?: string;
}

@Injectable()
export class CvParseEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CvParseEventsConsumer.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(
    private readonly configService: ConfigService,
    private readonly candidateService: CandidateService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('rabbitmq.url');
    const exchange = this.configService.get<string>('rabbitmq.exchange');
    const queueName = this.configService.get<string>(
      'candidateService.queues.cvParsed',
      QUEUES.CANDIDATE_CV_PARSED,
    );

    if (!url || !exchange) {
      this.logger.warn('RabbitMQ config missing, CV parse result consumer is disabled');
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
        await channel.bindQueue(queueName, exchange, EVENTS.CV_PARSED);
        await channel.bindQueue(queueName, exchange, EVENTS.CV_PARSE_FAILED);
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
      if (message.fields.routingKey === EVENTS.CV_PARSED) {
        const payload = this.parseParsedPayload(message);
        await this.candidateService.applyParsedResume(
          payload.candidateId,
          payload.normalizedPayload,
          payload.candidateCvId,
        );
      } else if (message.fields.routingKey === EVENTS.CV_PARSE_FAILED) {
        const payload = this.parseFailedPayload(message);
        await this.candidateService.markCvParseFailed(
          payload.candidateId,
          payload.candidateCvId,
          payload.errorMessage,
        );
      }
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process CV parse result event', error as Error);
      this.channel.nack(message, false, false);
    }
  }

  private parseParsedPayload(message: ConsumeMessage): CvParsedPayload {
    const payload = JSON.parse(message.content.toString()) as CvParsedPayload;
    if (!payload.candidateId || !payload.candidateCvId || !payload.normalizedPayload) {
      throw new Error('Invalid CV parsed payload');
    }
    return payload;
  }

  private parseFailedPayload(message: ConsumeMessage): CvParseFailedPayload {
    const payload = JSON.parse(message.content.toString()) as CvParseFailedPayload;
    if (!payload.candidateId || !payload.candidateCvId) {
      throw new Error('Invalid CV parse failed payload');
    }
    return payload;
  }
}
