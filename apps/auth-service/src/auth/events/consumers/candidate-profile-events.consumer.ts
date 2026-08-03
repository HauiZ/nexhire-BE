import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EVENTS, QUEUES, UserLanguage } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

interface CandidateProfileSnapshotChangedPayload {
  candidateUserId: string;
  fullName?: string | null;
  phone?: string | null;
  language?: UserLanguage;
  changedAt?: string;
}

@Injectable()
export class CandidateProfileEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CandidateProfileEventsConsumer.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('rabbitmq.url');
    const exchange = this.configService.get<string>('rabbitmq.exchange');
    const queueName = this.configService.get<string>(
      'authService.queues.candidateProfile',
      QUEUES.AUTH_CANDIDATE_PROFILE,
    );

    if (!url || !exchange) {
      this.logger.warn('RabbitMQ config missing, candidate profile consumer is disabled');
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
        await channel.bindQueue(queueName, exchange, EVENTS.CANDIDATE_PROFILE_SNAPSHOT_CHANGED);
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
      await this.syncUserSnapshot(payload);
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process candidate profile event', error as Error);
      this.channel.nack(message, false, false);
    }
  }

  private parsePayload(message: ConsumeMessage): CandidateProfileSnapshotChangedPayload {
    const payload = JSON.parse(
      message.content.toString(),
    ) as CandidateProfileSnapshotChangedPayload;
    if (!payload.candidateUserId) {
      throw new Error('Invalid candidate profile snapshot payload');
    }
    return payload;
  }

  private async syncUserSnapshot(payload: CandidateProfileSnapshotChangedPayload): Promise<void> {
    const patch: Partial<User> = {};
    if (payload.fullName !== undefined) {
      patch.fullName = payload.fullName;
    }
    if (payload.phone !== undefined) {
      patch.phone = payload.phone;
    }
    if (payload.language !== undefined) {
      patch.language = payload.language;
    }
    if (Object.keys(patch).length === 0) {
      return;
    }

    await this.userRepo.update(payload.candidateUserId, patch);
    this.logger.log(`Synced candidate user snapshot userId=${payload.candidateUserId}`);
  }
}
