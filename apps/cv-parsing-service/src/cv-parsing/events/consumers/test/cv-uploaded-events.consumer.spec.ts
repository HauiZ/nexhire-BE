import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsumeMessage } from 'amqplib';
import { CvUploadedEventsConsumer } from '../cv-uploaded-events.consumer';
import { CvParsingService } from '../../../cv-parsing.service';
import { ProviderConfigurationException } from '../../../../openai/provider-configuration.exception';

describe('CvUploadedEventsConsumer failure routing', () => {
  const payload = {
    candidateId: 'synthetic-candidate',
    candidateUserId: 'synthetic-user',
    candidateCvId: 'synthetic-cv',
    documentId: 'synthetic-document',
    documentUrl: 'https://storage.invalid/synthetic.pdf',
    context: 'PROFILE_UPDATE',
  };

  async function deliver(failure: Error, publishFailure = false, retries = 1) {
    const channel = { publish: jest.fn(), ack: jest.fn(), nack: jest.fn() };
    channel.publish.mockImplementation(async () => {
      if (publishFailure) throw new Error('synthetic broker failure');
    });
    const processUploadedCv = jest.fn().mockRejectedValue(failure);
    const consumer = new CvUploadedEventsConsumer(
      {} as ConfigService,
      { processUploadedCv } as unknown as CvParsingService,
    );
    Object.assign(consumer, { channel, exchange: 'events', queueName: 'cv-uploaded' });
    const message = {
      content: Buffer.from(JSON.stringify(payload)),
      fields: { routingKey: 'cv.uploaded' },
      properties: {
        messageId: 'synthetic-event',
        headers: { 'x-retry-count': retries, 'x-death': [{ count: 1 }], trace: 'synthetic-trace' },
      },
    } as unknown as ConsumeMessage;
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await (consumer as unknown as { consume(m: ConsumeMessage): Promise<void> }).consume(message);
    } finally {
      log.mockRestore();
    }
    return { channel, message, processUploadedCv };
  }

  it('sends terminal failures directly to DLQ preserving body, properties and history', async () => {
    const { channel, message, processUploadedCv } = await deliver(
      new ProviderConfigurationException('model_not_found'),
    );
    expect(processUploadedCv).toHaveBeenCalledTimes(1);
    expect(channel.publish).toHaveBeenCalledWith(
      'events.dlx',
      'cv.uploaded',
      message.content,
      expect.objectContaining({
        persistent: true,
        messageId: 'synthetic-event',
        headers: {
          ...message.properties.headers,
          'x-original-queue': 'cv-uploaded',
          'x-dead-letter-reason': 'provider-configuration-error',
          'x-provider-error-code': 'model_not_found',
        },
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.publish.mock.invocationCallOrder[0]).toBeLessThan(
      channel.ack.mock.invocationCallOrder[0],
    );
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('preserves delayed retry for transient failures', async () => {
    const { channel } = await deliver(new ServiceUnavailableException('temporary'));
    expect(channel.publish).toHaveBeenCalledWith(
      'events.retry',
      'cv.uploaded',
      expect.any(Buffer),
      expect.objectContaining({ headers: expect.objectContaining({ 'x-retry-count': 2 }) }),
    );
  });

  it('preserves retry exhaustion for transient failures', async () => {
    const { channel } = await deliver(new ServiceUnavailableException('temporary'), false, 3);
    expect(channel.publish).toHaveBeenCalledWith(
      'events.dlx',
      'cv.uploaded',
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-retry-count': 3,
          'x-dead-letter-reason': 'retry-limit-exceeded',
        }),
      }),
    );
  });

  it('requeues without ack if durable DLQ publication fails', async () => {
    const { channel, message } = await deliver(
      new ProviderConfigurationException('invalid_api_key'),
      true,
    );
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
  });
});
