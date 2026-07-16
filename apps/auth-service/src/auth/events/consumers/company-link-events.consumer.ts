import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { CompanyStatus, EVENTS } from '@nexhire/shared';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { Repository } from 'typeorm';
import { RecruiterCompanyLink } from '../../entities/recruiter-company-link.entity';

interface CompanyPostingSnapshotChangedPayload {
  companyId: string;
  ownerUserId: string;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  companyStatus: CompanyStatus;
  changedAt?: string;
}

@Injectable()
export class CompanyLinkEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompanyLinkEventsConsumer.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(RecruiterCompanyLink)
    private readonly linkRepo: Repository<RecruiterCompanyLink>,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('rabbitmq.url');
    const exchange = this.configService.get<string>('rabbitmq.exchange');
    const queueName = this.configService.get<string>(
      'authService.queues.companyLink',
      'auth.company-link',
    );

    if (!url || !exchange) {
      this.logger.warn('RabbitMQ config missing, company link consumer is disabled');
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
      await this.upsertCompanyLink(payload);
      this.channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to process company link event', error as Error);
      this.channel.nack(message, false, false);
    }
  }

  private parsePayload(message: ConsumeMessage): CompanyPostingSnapshotChangedPayload {
    const payload = JSON.parse(message.content.toString()) as CompanyPostingSnapshotChangedPayload;
    if (!payload.companyId || !payload.ownerUserId || !payload.companyStatus) {
      throw new Error('Invalid company posting snapshot payload');
    }
    if (!Object.values(CompanyStatus).includes(payload.companyStatus)) {
      throw new Error(`Invalid company status: ${payload.companyStatus}`);
    }
    return payload;
  }

  private async upsertCompanyLink(payload: CompanyPostingSnapshotChangedPayload): Promise<void> {
    const lastSyncedAt = payload.changedAt ? new Date(payload.changedAt) : new Date();
    const existing = await this.linkRepo.findOne({ where: { userId: payload.ownerUserId } });
    if (existing) {
      existing.companyId = payload.companyId;
      existing.companyName = payload.companyName ?? null;
      existing.companyLogoUrl = payload.companyLogoUrl ?? null;
      existing.companyStatus = payload.companyStatus;
      existing.lastSyncedAt = lastSyncedAt;
      await this.linkRepo.save(existing);
      return;
    }

    await this.linkRepo.save(
      this.linkRepo.create({
        userId: payload.ownerUserId,
        companyId: payload.companyId,
        companyName: payload.companyName ?? null,
        companyLogoUrl: payload.companyLogoUrl ?? null,
        companyStatus: payload.companyStatus,
        lastSyncedAt,
      }),
    );
  }
}
