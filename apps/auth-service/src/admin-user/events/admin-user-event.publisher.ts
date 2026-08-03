import { Injectable, Logger } from '@nestjs/common';
import { EventPublisher } from '@nexhire/infra';
import { EVENTS, UserRole } from '@nexhire/shared';
import { UserStatus } from '../../auth/entities/auth.enum';

@Injectable()
export class AdminUserEventPublisher {
  private readonly logger = new Logger(AdminUserEventPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publishUserLifecycleChanged(payload: {
    userId: string;
    email: string;
    fullName: string | null;
    roles: UserRole[];
    previousStatus: UserStatus;
    status: UserStatus;
    reason: string | null;
    changedByUserId: string;
    changedAt: string;
  }): Promise<void> {
    await this.eventPublisher.publish(EVENTS.USER_LIFECYCLE_CHANGED, payload).catch((error) => {
      this.logger.error(`Failed to publish user lifecycle event: ${(error as Error).message}`);
    });
  }
}
