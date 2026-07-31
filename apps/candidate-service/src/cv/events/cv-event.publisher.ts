import { Injectable, Logger } from '@nestjs/common';
import { EventPublisher } from '@nexhire/infra';
import { createEventEnvelope, EVENTS } from '@nexhire/shared';

export interface CvUploadedPayload {
  candidateId: string;
  candidateUserId: string;
  candidateCvId: string;
  documentId: string;
  documentUrl: string;
  context: 'PROFILE_UPDATE';
  uploadedAt: string;
}

@Injectable()
export class CvEventPublisher {
  private readonly logger = new Logger(CvEventPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publishCvUploaded(payload: CvUploadedPayload): Promise<void> {
    await this.eventPublisher
      .publish(
        EVENTS.CV_UPLOADED,
        createEventEnvelope({
          eventType: EVENTS.CV_UPLOADED,
          producer: 'candidate-service',
          data: payload,
        }),
      )
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to publish CV uploaded event candidateCvId=${payload.candidateCvId}: ${
            (error as Error).message
          }`,
        );
        throw error;
      });
  }
}
