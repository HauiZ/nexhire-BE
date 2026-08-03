import { Injectable } from '@nestjs/common';
import { EventPublisher } from '@nexhire/infra';
import { EVENTS, UserLanguage } from '@nexhire/shared';

@Injectable()
export class CandidateEventPublisher {
  constructor(private readonly eventPublisher: EventPublisher) {}

  async publishProfileSnapshotChanged(payload: {
    candidateId: string;
    candidateUserId: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    avatarDocumentId: string | null;
    language: UserLanguage;
    changedAt: string;
  }): Promise<void> {
    await this.eventPublisher
      .publish(EVENTS.CANDIDATE_PROFILE_SNAPSHOT_CHANGED, payload)
      .catch(() => undefined);
  }
}
