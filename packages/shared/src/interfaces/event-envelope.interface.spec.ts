import { createEventEnvelope, isEventEnvelope, unwrapEventData } from './event-envelope.interface';

describe('event envelope helpers', () => {
  it('creates a traceable event envelope', () => {
    const envelope = createEventEnvelope({
      eventId: 'event-1',
      eventType: 'cv.uploaded',
      occurredAt: '2026-07-30T00:00:00.000Z',
      producer: 'candidate-service',
      data: { candidateCvId: 'cv-1' },
    });

    expect(envelope).toEqual({
      eventId: 'event-1',
      eventType: 'cv.uploaded',
      occurredAt: '2026-07-30T00:00:00.000Z',
      producer: 'candidate-service',
      data: { candidateCvId: 'cv-1' },
    });
    expect(isEventEnvelope(envelope)).toBe(true);
  });

  it('unwraps envelope data and keeps raw payloads compatible', () => {
    const rawPayload = { candidateCvId: 'cv-1' };
    const envelope = createEventEnvelope({
      eventType: 'cv.uploaded',
      producer: 'candidate-service',
      data: rawPayload,
    });

    expect(unwrapEventData(envelope)).toBe(rawPayload);
    expect(unwrapEventData(rawPayload)).toBe(rawPayload);
  });
});
