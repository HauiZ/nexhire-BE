import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobService } from './job.service';

@Injectable()
export class JobExpirationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobExpirationScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly jobService: JobService,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.configService.get<number>(
      'jobService.expiration.sweepIntervalMs',
      60000,
    );
    this.timer = setInterval(() => void this.run(), intervalMs);
    this.timer.unref?.();
    void this.run();
    this.logger.log(`Job expiration scheduler started intervalMs=${intervalMs}`);
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
      await this.jobService.expirePublishedJobs();
    } catch (error) {
      this.logger.error(`Job expiration sweep failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
