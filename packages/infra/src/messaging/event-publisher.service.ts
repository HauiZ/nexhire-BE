import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';

const PUBLISH_CONFIRM_TIMEOUT_MS = 5000;
const PUBLISH_RETRY_ATTEMPTS = 3;

/**
 * Publishes domain events to the RabbitMQ topic exchange. Producers call
 * `publish(routingKey, payload)`; consumers live in the owning service.
 * Uses a confirm channel + persistent messages for at-least-once delivery.
 */
@Injectable()
export class EventPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventPublisher.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;
  private readonly url: string;
  private readonly exchange: string;

  constructor(config: ConfigService) {
    this.url = config.get<string>('rabbitmq.url') as string;
    this.exchange = config.get<string>('rabbitmq.exchange') as string;
  }

  onModuleInit(): void {
    this.connection = connect([this.url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ connected'));
    this.connection.on('disconnect', (e) =>
      this.logger.warn(`RabbitMQ disconnected: ${e.err?.message}`),
    );
    this.channel = this.connection.createChannel({
      json: true,
      setup: (ch: ConfirmChannel) => ch.assertExchange(this.exchange, 'topic', { durable: true }),
    });
  }

  /** Publish an event. `routingKey` is a dotted topic (e.g. 'application.submitted'). */
  async publish(
    routingKey: string,
    payload: unknown,
    headers?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('EventPublisher channel not initialized');
    }
    await this.publishWithRetry(routingKey, payload, headers);
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  private async publishWithRetry(
    routingKey: string,
    payload: unknown,
    headers?: Record<string, unknown>,
  ): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= PUBLISH_RETRY_ATTEMPTS; attempt += 1) {
      try {
        await this.withTimeout(
          this.channel!.publish(this.exchange, routingKey, payload, {
            persistent: true,
            contentType: 'application/json',
            headers,
          }),
          PUBLISH_CONFIRM_TIMEOUT_MS,
          `RabbitMQ publish confirm timeout routingKey=${routingKey}`,
        );
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `RabbitMQ publish failed routingKey=${routingKey} attempt=${attempt}/${PUBLISH_RETRY_ATTEMPTS}: ${
            (error as Error).message
          }`,
        );
      }
    }
    throw lastError;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
