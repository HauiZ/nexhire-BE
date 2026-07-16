import { Injectable, Logger } from '@nestjs/common';
import { EventPublisher } from '@nexhire/infra';
import { EVENTS } from '@nexhire/shared';
import { CompanyPostingSnapshotDto } from '../dto/company-posting-snapshot.dto';

@Injectable()
export class CompanyEventPublisher {
  private readonly logger = new Logger(CompanyEventPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publishPostingSnapshotChanged(payload: CompanyPostingSnapshotDto): Promise<void> {
    await this.eventPublisher
      .publish(EVENTS.COMPANY_POSTING_SNAPSHOT_CHANGED, payload)
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to publish company snapshot event companyId=${payload.companyId}: ${
            (error as Error).message
          }`,
        );
      });
  }
}
