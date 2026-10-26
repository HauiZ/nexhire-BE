import { ConfigService } from '@nestjs/config';
import { retryOrDeadLetter } from '@nexhire/infra';
import { ConsumeMessage } from 'amqplib';
import { ApplicationService } from '../../application.service';
import { MatchingCompletedEventsConsumer } from './matching-completed-events.consumer';

jest.mock('@nexhire/infra', () => ({
  retryOrDeadLetter: jest.fn(),
  setupReliableQueue: jest.fn(),
}));

describe('MatchingCompletedEventsConsumer retirement boundary', () => {
  const applicationId = '11111111-1111-4111-8111-111111111111';
  const completed = {
    applicationId,
    status: 'SUCCEEDED',
    scoringStatus: 'NOT_AVAILABLE',
    totalScore: null,
    matchLevel: null,
  };
  let consumer: MatchingCompletedEventsConsumer;
  let service: { updateMatchSnapshot: jest.Mock };
  let channel: { ack: jest.Mock; nack: jest.Mock };
  beforeEach(() => {
    jest.clearAllMocks();
    service = { updateMatchSnapshot: jest.fn().mockResolvedValue({}) };
    channel = { ack: jest.fn(), nack: jest.fn() };
    consumer = new MatchingCompletedEventsConsumer(
      new ConfigService(),
      service as unknown as ApplicationService,
    );
    Object.assign(consumer, { channel, exchange: 'events', queueName: 'test' });
  });
  const message = (data: unknown) =>
    ({ content: Buffer.from(JSON.stringify(data)), properties: {}, fields: {} }) as ConsumeMessage;
  const consume = (instance: MatchingCompletedEventsConsumer, data: unknown) =>
    (instance as unknown as { consume: (message: ConsumeMessage) => Promise<void> }).consume(
      message(data),
    );

  it('accepts explicit no-score completion and acknowledges repeated delivery', async () => {
    await consume(consumer, completed);
    await consume(consumer, completed);
    expect(service.updateMatchSnapshot).toHaveBeenCalledWith(applicationId, {
      scoringStatus: 'NOT_AVAILABLE',
      matchScore: null,
      matchLevel: null,
    });
    expect(channel.ack).toHaveBeenCalledTimes(2);
    expect(retryOrDeadLetter).not.toHaveBeenCalled();
  });
  it.each(['SUCCEEDED', 'FAILED'])(
    'acks retired numeric %s replay without writes or retry',
    async (status) => {
      await consume(consumer, { applicationId, status, totalScore: 82, matchLevel: 'HIGH' });
      expect(service.updateMatchSnapshot).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(retryOrDeadLetter).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...completed, scoringStatus: undefined },
    { ...completed, totalScore: undefined },
    { ...completed, totalScore: 0 },
    { ...completed, matchLevel: undefined },
    { ...completed, status: 'PROCESSING' },
    { ...completed, applicationId: 'invalid' },
    { applicationId, status: 'SUCCEEDED', totalScore: '82' },
    { applicationId, status: 'SUCCEEDED', totalScore: -1 },
    { applicationId, status: 'SUCCEEDED', totalScore: 101 },
    { applicationId, status: 'SUCCEEDED', totalScore: 82, matchLevel: 'INVALID' },
    null,
  ])('retries malformed payload without mutation %j', async (payload) => {
    await consume(consumer, payload);
    expect(service.updateMatchSnapshot).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
    expect(retryOrDeadLetter).toHaveBeenCalledTimes(1);
  });
  it('acknowledges explicit failed execution without score mutation', async () => {
    await consume(consumer, { ...completed, status: 'FAILED' });
    expect(service.updateMatchSnapshot).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
  });
});
