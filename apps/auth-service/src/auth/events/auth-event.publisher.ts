import { Injectable } from '@nestjs/common';
import { EventPublisher } from '@nexhire/infra';
import { EVENTS } from '@nexhire/shared';

@Injectable()
export class AuthEventPublisher {
  constructor(private readonly eventPublisher: EventPublisher) {}

  async publishVerificationEmailRequested(payload: {
    email: string;
    fullName: string | null;
    token: string;
    expiresAt: string;
  }): Promise<void> {
    await this.eventPublisher.publish(EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED, payload);
  }

  async publishPasswordResetRequested(payload: {
    email: string;
    fullName: string | null;
    token: string;
    expiresAt: string;
  }): Promise<void> {
    await this.eventPublisher.publish(EVENTS.AUTH_PASSWORD_RESET_REQUESTED, payload);
  }
}
