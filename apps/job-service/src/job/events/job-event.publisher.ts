import { Injectable, Logger } from '@nestjs/common';
import { EventPublisher } from '@nexhire/infra';
import { EVENTS, JobModerationRiskLevel, JobReviewDecision } from '@nexhire/shared';
import { JobRevisionStatus, JobStatus } from '@nexhire/shared';
import { JobModerationTargetType } from '../entities/job.enum';

export interface JobReviewTrustSignalPayload {
  companyId: string;
  jobId: string;
  targetType: JobModerationTargetType;
  targetId: string;
  decision: JobReviewDecision;
  riskLevel: JobModerationRiskLevel | null;
  riskScore: number | null;
  reviewedAt?: string;
}

@Injectable()
export class JobEventPublisher {
  private readonly logger = new Logger(JobEventPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publishJobPublished(payload: {
    jobId: string;
    companyId: string;
    version: number;
    publishedAt?: string;
  }): Promise<void> {
    await this.publish(EVENTS.JOB_PUBLISHED, payload);
  }

  async publishJobReviewRequired(payload: {
    jobId: string;
    companyId: string;
    companyName: string | null;
    title: string;
    status: JobStatus;
    version: number;
    riskScore: number | null;
    riskLevel: JobModerationRiskLevel | null;
    submittedAt?: string;
  }): Promise<void> {
    await this.publish(EVENTS.JOB_REVIEW_REQUIRED, payload);
  }

  async publishJobRevisionReviewRequired(payload: {
    jobId: string;
    companyId: string;
    title: string;
    revisionId: string;
    status: JobRevisionStatus;
    riskScore: number | null;
    riskLevel: JobModerationRiskLevel | null;
    submittedAt?: string;
  }): Promise<void> {
    await this.publish(EVENTS.JOB_REVISION_REVIEW_REQUIRED, payload);
  }

  async publishRevisionApproved(payload: {
    jobId: string;
    companyId: string;
    revisionId: string;
    approvedAt?: string;
  }): Promise<void> {
    await this.publish(EVENTS.JOB_REVISION_APPROVED, payload);
  }

  async publishJobUnpublished(payload: {
    jobId: string;
    companyId: string;
    reason: string | null;
    unpublishedAt?: string;
  }): Promise<void> {
    await this.publish(EVENTS.JOB_UNPUBLISHED, payload);
  }

  async publishJobClosed(payload: {
    jobId: string;
    companyId: string;
    reason: string | null;
    closedAt?: string;
  }): Promise<void> {
    await this.publish(EVENTS.JOB_CLOSED, payload);
  }

  async publishReviewTrustSignal(payload: JobReviewTrustSignalPayload): Promise<void> {
    await this.publish(EVENTS.JOB_REVIEW_TRUST_SIGNAL, payload);
  }

  private async publish(routingKey: string, payload: unknown): Promise<void> {
    await this.eventPublisher.publish(routingKey, payload).catch((error: unknown) => {
      this.logger.error(
        `Failed to publish job event routingKey=${routingKey}: ${(error as Error).message}`,
      );
    });
  }
}
