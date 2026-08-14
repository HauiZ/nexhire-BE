import { Injectable, Logger } from '@nestjs/common';
import { EventPublisher } from '@nexhire/infra';
import { createEventEnvelope, EVENTS, ParsedResume } from '@nexhire/shared';

export interface CvParsedPayload {
  parseRequestId: string;
  candidateId: string;
  candidateUserId: string;
  candidateCvId: string;
  documentId: string;
  context: string;
  normalizedPayload: ParsedResume;
  parsedAt: string;
}

export interface CvParseFailedPayload {
  parseRequestId?: string;
  candidateId: string;
  candidateUserId: string;
  candidateCvId: string;
  documentId: string;
  context: string;
  errorMessage: string;
  failedAt: string;
}

@Injectable()
export class CvParseEventPublisher {
  private readonly logger = new Logger(CvParseEventPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publishCvParsed(payload: CvParsedPayload): Promise<void> {
    await this.publish(EVENTS.CV_PARSED, payload, payload.candidateCvId);
  }

  async publishCvParseFailed(payload: CvParseFailedPayload): Promise<void> {
    await this.publish(EVENTS.CV_PARSE_FAILED, payload, payload.candidateCvId);
  }

  private async publish(
    routingKey: string,
    payload: unknown,
    candidateCvId: string,
  ): Promise<void> {
    await this.eventPublisher
      .publish(
        routingKey,
        createEventEnvelope({
          eventType: routingKey,
          producer: 'cv-parsing-service',
          data: payload,
        }),
      )
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to publish CV parse event routingKey=${routingKey} candidateCvId=${candidateCvId}: ${
            (error as Error).message
          }`,
        );
        throw error;
      });
  }
}
