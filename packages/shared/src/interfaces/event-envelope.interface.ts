import { randomUUID } from 'node:crypto';

export interface EventEnvelope<TData = unknown> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  producer: string;
  correlationId?: string;
  causationId?: string;
  data: TData;
}

export interface CreateEventEnvelopeOptions<TData> {
  eventType: string;
  producer: string;
  data: TData;
  eventId?: string;
  occurredAt?: string;
  correlationId?: string;
  causationId?: string;
}

export const createEventEnvelope = <TData>({
  eventType,
  producer,
  data,
  eventId = randomUUID(),
  occurredAt = new Date().toISOString(),
  correlationId,
  causationId,
}: CreateEventEnvelopeOptions<TData>): EventEnvelope<TData> => ({
  eventId,
  eventType,
  occurredAt,
  producer,
  correlationId,
  causationId,
  data,
});

export const isEventEnvelope = <TData = unknown>(value: unknown): value is EventEnvelope<TData> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<EventEnvelope<TData>>;
  return (
    typeof candidate.eventId === 'string' &&
    typeof candidate.eventType === 'string' &&
    typeof candidate.occurredAt === 'string' &&
    typeof candidate.producer === 'string' &&
    'data' in candidate
  );
};

export const unwrapEventData = <TData>(value: TData | EventEnvelope<TData>): TData =>
  isEventEnvelope<TData>(value) ? value.data : value;
