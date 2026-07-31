import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { formatQueueMonitorAlert, QueueAlertState } from './templates/queue-monitor-alert.template';

interface RabbitQueueResponse {
  name: string;
  messages: number;
  messages_ready: number;
  messages_unacknowledged: number;
  consumers: number;
}

@Injectable()
export class QueueMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMonitorService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly lastAlertAtByQueue = new Map<string, number>();
  private readonly activeAlerts = new Set<string>();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      return;
    }

    const intervalMs = this.intervalMs();
    this.timer = setInterval(() => void this.run(), intervalMs);
    this.timer.unref?.();
    void this.run();
    this.logger.log(
      `RabbitMQ queue monitor started intervalMs=${intervalMs} threshold=${this.alertThreshold()} queues=${this.startupQueueDescription()}`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async run(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const configuredQueues = this.configuredQueues();
      if (configuredQueues.length) {
        await Promise.all(configuredQueues.map((queueName) => this.checkQueue(queueName)));
        return;
      }

      const queues = await this.fetchQueues();
      await Promise.all(queues.map((queue) => this.checkQueueSnapshot(queue)));
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.warn(`RabbitMQ queue monitor failed: ${axiosError.message}`);
    } finally {
      this.running = false;
    }
  }

  private async checkQueue(queueName: string): Promise<void> {
    try {
      const queue = await this.fetchQueue(queueName);
      await this.checkQueueSnapshot(queue);
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        this.logger.warn(`RabbitMQ queue not found queue=${queueName}`);
        return;
      }
      this.logger.warn(`RabbitMQ queue monitor failed queue=${queueName}: ${axiosError.message}`);
    }
  }

  private async checkQueueSnapshot(queue: RabbitQueueResponse): Promise<void> {
    const threshold = this.alertThreshold();
    const shouldAlert =
      queue.messages >= threshold ||
      this.hasDeadLetterBacklog(queue) ||
      this.hasNoConsumerRisk(queue);
    if (shouldAlert) {
      this.logger.warn(
        `RabbitMQ queue risk detected queue=${queue.name} messages=${queue.messages} consumers=${queue.consumers} threshold=${threshold}`,
      );
      await this.alertBacklog(queue);
      return;
    }

    if (this.activeAlerts.has(queue.name)) {
      this.activeAlerts.delete(queue.name);
      await this.sendTelegramMessage(this.formatQueueAlert(queue, 'recovered'));
    }
  }

  private async alertBacklog(queue: RabbitQueueResponse): Promise<void> {
    const now = Date.now();
    const lastAlertAt = this.lastAlertAtByQueue.get(queue.name) ?? 0;
    if (now - lastAlertAt < this.alertCooldownMs()) {
      this.logger.warn(
        `RabbitMQ backlog alert suppressed by cooldown queue=${queue.name} messages=${queue.messages}`,
      );
      return;
    }

    this.lastAlertAtByQueue.set(queue.name, now);
    this.activeAlerts.add(queue.name);
    const sent = await this.sendTelegramMessage(this.formatQueueAlert(queue, 'backlog'));
    if (sent) {
      this.logger.log(`RabbitMQ backlog alert sent to Telegram queue=${queue.name}`);
    }
  }

  private formatQueueAlert(queue: RabbitQueueResponse, state: QueueAlertState): string {
    return formatQueueMonitorAlert({
      queue,
      state,
      threshold: this.alertThreshold(),
      intervalMs: this.intervalMs(),
      cooldownMs: this.alertCooldownMs(),
      vhost: this.vhost(),
      managementUrl: this.managementUrl(),
      extraNote: this.alertNote(queue),
    });
  }

  private async fetchQueue(queueName: string): Promise<RabbitQueueResponse> {
    const url = `${this.managementUrl()}/api/queues/${encodeURIComponent(
      this.vhost(),
    )}/${encodeURIComponent(queueName)}`;
    const response = await firstValueFrom(
      this.httpService.get<RabbitQueueResponse>(url, {
        timeout: 5000,
        headers: this.managementAuthHeaders(),
      }),
    );
    return response.data;
  }

  private async fetchQueues(): Promise<RabbitQueueResponse[]> {
    const url = `${this.managementUrl()}/api/queues/${encodeURIComponent(this.vhost())}`;
    const response = await firstValueFrom(
      this.httpService.get<RabbitQueueResponse[]>(url, {
        timeout: 5000,
        headers: this.managementAuthHeaders(),
      }),
    );
    return response.data;
  }

  private async sendTelegramMessage(text: string): Promise<boolean> {
    const botToken = this.telegramBotToken();
    const chatId = this.telegramChatId();
    if (!botToken || !chatId) {
      this.logger.warn('Telegram alert skipped because bot token or chat id is missing');
      return false;
    }

    return firstValueFrom(
      this.httpService.post(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        },
        { timeout: 5000 },
      ),
    )
      .then(() => true)
      .catch((error: unknown) => {
        const axiosError = error as AxiosError<{ description?: string }>;
        this.logger.warn(
          `Telegram alert failed: ${axiosError.response?.data?.description ?? axiosError.message}`,
        );
        return false;
      });
  }

  private isEnabled(): boolean {
    if (!this.configService.get<boolean>('notificationService.queueMonitor.enabled', false)) {
      return false;
    }
    if (!this.telegramBotToken() || !this.telegramChatId()) {
      this.logger.warn('Queue monitor is enabled but Telegram config is missing');
      return false;
    }
    return true;
  }

  private configuredQueues(): string[] {
    const configured = this.configService.get<string[] | undefined>(
      'notificationService.queueMonitor.queues',
    );
    if (!configured?.length) {
      return [];
    }

    const queues = [...configured];
    const testQueue = this.configService.get<string>(
      'notificationService.queueMonitor.testQueue',
      'queue-monitor.test-backlog',
    );
    const includeTestQueue = this.configService.get<boolean>(
      'notificationService.queueMonitor.includeTestQueue',
      true,
    );

    if (includeTestQueue) {
      queues.push(testQueue);
    }

    return [...new Set(queues)];
  }

  private hasDeadLetterBacklog(queue: RabbitQueueResponse): boolean {
    return queue.name.endsWith('.dlq') && queue.messages > 0;
  }

  private hasNoConsumerRisk(queue: RabbitQueueResponse): boolean {
    return !queue.name.endsWith('.dlq') && queue.messages > 0 && queue.consumers === 0;
  }

  private alertNote(queue: RabbitQueueResponse): string | undefined {
    if (this.hasDeadLetterBacklog(queue)) {
      return 'DLQ has failed events. Inspect payloads and decide whether to fix/reprocess manually.';
    }
    if (this.hasNoConsumerRisk(queue)) {
      return 'Queue has waiting messages but no active consumer. Check whether the owning service is running.';
    }
    return undefined;
  }

  private startupQueueDescription(): string {
    const configuredQueues = this.configuredQueues();
    return configuredQueues.length ? configuredQueues.join(',') : 'all RabbitMQ queues in vhost';
  }

  private intervalMs(): number {
    return this.configService.get<number>('notificationService.queueMonitor.intervalMs', 60000);
  }

  private alertThreshold(): number {
    return this.configService.get<number>('notificationService.queueMonitor.alertThreshold', 100);
  }

  private alertCooldownMs(): number {
    return this.configService.get<number>(
      'notificationService.queueMonitor.alertCooldownMs',
      900000,
    );
  }

  private managementUrl(): string {
    return this.configService.get<string>(
      'notificationService.queueMonitor.rabbitManagementUrl',
      'http://localhost:15672',
    );
  }

  private vhost(): string {
    return this.configService.get<string>(
      'notificationService.queueMonitor.rabbitManagementVhost',
      '/',
    );
  }

  private managementUser(): string {
    return this.configService.get<string>(
      'notificationService.queueMonitor.rabbitManagementUser',
      'nexhire',
    );
  }

  private managementPass(): string {
    return this.configService.get<string>(
      'notificationService.queueMonitor.rabbitManagementPass',
      'nexhire',
    );
  }

  private managementAuthHeaders(): { Authorization: string } {
    return {
      Authorization: `Basic ${Buffer.from(
        `${this.managementUser()}:${this.managementPass()}`,
      ).toString('base64')}`,
    };
  }

  private telegramBotToken(): string | undefined {
    return this.configService.get<string | undefined>(
      'notificationService.queueMonitor.telegramBotToken',
    );
  }

  private telegramChatId(): string | undefined {
    return this.configService.get<string | undefined>(
      'notificationService.queueMonitor.telegramChatId',
    );
  }
}
