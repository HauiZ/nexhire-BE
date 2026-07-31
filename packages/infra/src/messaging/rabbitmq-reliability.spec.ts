import { ConsumeMessage } from 'amqplib';
import { retryOrDeadLetter } from './rabbitmq-reliability';

const message = (headers: Record<string, unknown> = {}): ConsumeMessage =>
  ({
    content: Buffer.from('{"ok":true}'),
    fields: { routingKey: 'cv.uploaded' },
    properties: { headers },
  }) as ConsumeMessage;

describe('rabbitmq reliability helpers', () => {
  it('publishes failed messages to retry exchange below the retry limit', async () => {
    const channel = {
      ack: jest.fn(),
      nack: jest.fn(),
      publish: jest.fn().mockResolvedValue(true),
    };
    const failedMessage = message({ 'x-retry-count': 1 });

    const result = await retryOrDeadLetter(
      channel,
      failedMessage,
      'nexhire.events',
      'cv-parsing.cv-uploaded',
    );

    expect(result).toBe('retry');
    expect(channel.publish).toHaveBeenCalledWith(
      'nexhire.events.retry',
      'cv.uploaded',
      failedMessage.content,
      expect.objectContaining({
        persistent: true,
        headers: expect.objectContaining({
          'x-retry-count': 2,
          'x-original-queue': 'cv-parsing.cv-uploaded',
        }),
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(failedMessage);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('publishes failed messages to DLX after retry limit', async () => {
    const channel = {
      ack: jest.fn(),
      nack: jest.fn(),
      publish: jest.fn().mockResolvedValue(true),
    };
    const failedMessage = message({ 'x-retry-count': 3 });

    const result = await retryOrDeadLetter(
      channel,
      failedMessage,
      'nexhire.events',
      'cv-parsing.cv-uploaded',
    );

    expect(result).toBe('dead-letter');
    expect(channel.publish).toHaveBeenCalledWith(
      'nexhire.events.dlx',
      'cv.uploaded',
      failedMessage.content,
      expect.objectContaining({
        persistent: true,
        headers: expect.objectContaining({
          'x-retry-count': 3,
          'x-original-queue': 'cv-parsing.cv-uploaded',
          'x-dead-letter-reason': 'retry-limit-exceeded',
        }),
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(failedMessage);
    expect(channel.nack).not.toHaveBeenCalled();
  });
});
