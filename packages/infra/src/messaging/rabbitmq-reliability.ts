import { ConfirmChannel, ConsumeMessage, Options } from 'amqplib';

export const DEFAULT_RABBITMQ_RETRY_LIMIT = 3;
export const DEFAULT_RABBITMQ_RETRY_DELAY_MS = 10000;

export interface ReliableQueueOptions {
  exchange: string;
  queueName: string;
  bindingKeys: string[];
  retryLimit?: number;
  retryDelayMs?: number;
}

interface ReliableMessageChannel {
  ack(message: ConsumeMessage): void;
  nack(message: ConsumeMessage, allUpTo?: boolean, requeue?: boolean): void;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: Options.Publish,
  ): Promise<unknown> | boolean;
}

export const retryQueueName = (queueName: string): string => `${queueName}.retry`;
export const deadLetterQueueName = (queueName: string): string => `${queueName}.dlq`;
export const retryExchangeName = (exchange: string): string => `${exchange}.retry`;
export const deadLetterExchangeName = (exchange: string): string => `${exchange}.dlx`;

export const setupReliableQueue = async (
  channel: ConfirmChannel,
  {
    exchange,
    queueName,
    bindingKeys,
    retryDelayMs = DEFAULT_RABBITMQ_RETRY_DELAY_MS,
  }: ReliableQueueOptions,
): Promise<void> => {
  const retryExchange = retryExchangeName(exchange);
  const deadLetterExchange = deadLetterExchangeName(exchange);
  const retryQueue = retryQueueName(queueName);
  const dlq = deadLetterQueueName(queueName);

  await channel.assertExchange(exchange, 'topic', { durable: true });
  await channel.assertExchange(retryExchange, 'topic', { durable: true });
  await channel.assertExchange(deadLetterExchange, 'topic', { durable: true });

  await channel.assertQueue(queueName, {
    durable: true,
  });

  await channel.assertQueue(retryQueue, {
    durable: true,
    arguments: {
      'x-message-ttl': retryDelayMs,
      'x-dead-letter-exchange': exchange,
    },
  });

  await channel.assertQueue(dlq, { durable: true });

  for (const bindingKey of bindingKeys) {
    await channel.bindQueue(queueName, exchange, bindingKey);
    await channel.bindQueue(retryQueue, retryExchange, bindingKey);
    await channel.bindQueue(dlq, deadLetterExchange, bindingKey);
  }
};

export const retryOrDeadLetter = async (
  channel: ReliableMessageChannel,
  message: ConsumeMessage,
  exchange: string,
  queueName: string,
  options: Pick<ReliableQueueOptions, 'retryLimit'> = {},
): Promise<'retry' | 'dead-letter'> => {
  const retryLimit = options.retryLimit ?? DEFAULT_RABBITMQ_RETRY_LIMIT;
  const retryCount = getRetryCount(message);
  if (retryCount >= retryLimit) {
    await channel.publish(
      deadLetterExchangeName(exchange),
      message.fields.routingKey,
      message.content,
      {
        ...message.properties,
        persistent: true,
        headers: {
          ...(message.properties.headers ?? {}),
          'x-retry-count': retryCount,
          'x-original-queue': queueName,
          'x-dead-letter-reason': 'retry-limit-exceeded',
        },
      } as Options.Publish,
    );
    channel.ack(message);
    return 'dead-letter';
  }

  await channel.publish(retryExchangeName(exchange), message.fields.routingKey, message.content, {
    ...message.properties,
    persistent: true,
    headers: {
      ...(message.properties.headers ?? {}),
      'x-retry-count': retryCount + 1,
      'x-original-queue': queueName,
    },
  } as Options.Publish);
  channel.ack(message);
  return 'retry';
};

export const getRetryCount = (message: ConsumeMessage): number => {
  const value = message.properties.headers?.['x-retry-count'];
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};
