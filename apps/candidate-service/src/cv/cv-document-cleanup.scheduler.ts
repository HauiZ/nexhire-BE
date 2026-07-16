import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CvService } from './cv.service';

@Injectable()
export class CvDocumentCleanupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CvDocumentCleanupScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly cvService: CvService,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.configService.get<number>(
      'candidateService.cvCleanup.sweepIntervalMs',
      3600000,
    );
    this.timer = setInterval(() => void this.run(), intervalMs);
    this.timer.unref?.();
    this.logger.log(`CV document cleanup scheduler started intervalMs=${intervalMs}`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async run(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.cvService.purgeDeletedCvDocuments();
    } catch (error) {
      this.logger.error(`CV document cleanup sweep failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
