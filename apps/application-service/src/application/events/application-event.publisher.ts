import { Injectable, Logger } from '@nestjs/common';
import { EventPublisher } from '@nexhire/infra';
import { ApplicationStage, EVENTS } from '@nexhire/shared';

@Injectable()
export class ApplicationEventPublisher {
  private readonly logger = new Logger(ApplicationEventPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publishApplicationSubmitted(payload: {
    applicationId: string;
    jobId: string;
    jobTitle: string;
    candidateId: string;
    candidateUserId: string;
    candidateCvId: string;
    cvDocumentId: string;
    candidateFullName: string | null;
    candidateAvatarDocumentId: string | null;
    companyId: string;
    companyName: string | null;
    companyLogoUrl: string | null;
    companyLogoDocumentId: string | null;
    submittedAt: string;
  }): Promise<void> {
    await this.publish(EVENTS.APPLICATION_SUBMITTED, payload);
  }

  async publishApplicationStageChanged(payload: {
    applicationId: string;
    jobId: string;
    jobTitle: string;
    companyId: string;
    companyName: string | null;
    companyLogoUrl: string | null;
    companyLogoDocumentId: string | null;
    candidateId: string;
    candidateUserId: string;
    candidateFullName: string | null;
    candidateAvatarDocumentId: string | null;
    previousStatus: ApplicationStage;
    status: ApplicationStage;
    note: string | null;
    changedAt: string;
  }): Promise<void> {
    await this.publish(EVENTS.APPLICATION_STAGE_CHANGED, payload);
  }

  async publishApplicationCvViewed(payload: {
    applicationId: string;
    jobId: string;
    jobTitle: string;
    companyId: string;
    companyName: string | null;
    companyLogoUrl: string | null;
    companyLogoDocumentId: string | null;
    candidateId: string;
    candidateUserId: string;
    candidateFullName: string | null;
    candidateAvatarDocumentId: string | null;
    viewedByUserId: string;
    viewedAt: string;
  }): Promise<void> {
    await this.publish(EVENTS.APPLICATION_CV_VIEWED, payload);
  }

  private async publish(routingKey: string, payload: unknown): Promise<void> {
    await this.eventPublisher.publish(routingKey, payload).catch((error: unknown) => {
      this.logger.error(
        `Failed to publish application event routingKey=${routingKey}: ${(error as Error).message}`,
      );
    });
  }
}
