import { Injectable, Logger } from '@nestjs/common';
import { EventPublisher } from '@nexhire/infra';
import { EVENTS, JobExperienceLevel } from '@nexhire/shared';

export interface FollowedCompanyJobPublishedPayload {
  jobId: string;
  jobTitle: string;
  companyId: string;
  companyName: string | null;
  companyLogoUrl: string | null;
  companyLogoDocumentId: string | null;
  experienceLevel: JobExperienceLevel;
  location: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  isSalaryVisible: boolean;
  publishedAt?: string | null;
  candidateUserIds: string[];
}

@Injectable()
export class FollowedCompanyEventPublisher {
  private readonly logger = new Logger(FollowedCompanyEventPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publishJobPublished(payload: FollowedCompanyJobPublishedPayload): Promise<void> {
    await this.eventPublisher
      .publish(EVENTS.COMPANY_FOLLOWED_JOB_PUBLISHED, payload)
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to publish followed company job event jobId=${payload.jobId}: ${(error as Error).message}`,
        );
      });
  }
}
