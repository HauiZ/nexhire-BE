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

type QueueAlertKind = 'backlog' | 'dlq' | 'no-consumer';

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
    const alertKind = this.alertKind(queue);
    if (alertKind) {
      this.logger.warn(
        `RabbitMQ queue risk detected kind=${alertKind} queue=${queue.name} messages=${queue.messages} consumers=${queue.consumers} threshold=${this.alertThresholdFor(alertKind)}`,
      );
      await this.alertBacklog(queue, alertKind);
      return;
    }

    const activeAlertKeys = this.activeAlertKeys(queue.name);
    if (activeAlertKeys.length) {
      activeAlertKeys.forEach((key) => this.activeAlerts.delete(key));
      const recoveredKind = this.alertKindFromKey(activeAlertKeys[0]) ?? 'backlog';
      await this.sendTelegramMessage(this.formatQueueAlert(queue, 'recovered', recoveredKind));
    }
  }

  private async alertBacklog(queue: RabbitQueueResponse, alertKind: QueueAlertKind): Promise<void> {
    const now = Date.now();
    const alertKey = this.alertKey(queue.name, alertKind);
    const lastAlertAt = this.lastAlertAtByQueue.get(alertKey) ?? 0;
    if (now - lastAlertAt < this.alertCooldownMsFor(alertKind)) {
      this.logger.warn(
        `RabbitMQ alert suppressed by cooldown kind=${alertKind} queue=${queue.name} messages=${queue.messages}`,
      );
      return;
    }

    this.lastAlertAtByQueue.set(alertKey, now);
    this.activeAlerts.add(alertKey);
    const sent = await this.sendTelegramMessage(this.formatQueueAlert(queue, 'backlog', alertKind));
    if (sent) {
      this.logger.log(`RabbitMQ alert sent to Telegram kind=${alertKind} queue=${queue.name}`);
    }
  }

  private formatQueueAlert(
    queue: RabbitQueueResponse,
    state: QueueAlertState,
    alertKind: QueueAlertKind,
  ): string {
    return formatQueueMonitorAlert({
      queue,
      state,
      threshold: this.alertThresholdFor(alertKind),
      intervalMs: this.intervalMs(),
      cooldownMs: this.alertCooldownMsFor(alertKind),
      vhost: this.vhost(),
      managementUrl: this.managementUrl(),
      extraNote: this.alertNote(queue, alertKind),
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

  private alertKind(queue: RabbitQueueResponse): QueueAlertKind | null {
    if (this.hasDeadLetterBacklog(queue)) {
      return 'dlq';
    }
    if (this.hasNoConsumerRisk(queue)) {
      return 'no-consumer';
    }
    if (queue.messages >= this.alertThreshold()) {
      return 'backlog';
    }
    return null;
  }

  private hasDeadLetterBacklog(queue: RabbitQueueResponse): boolean {
    return queue.name.endsWith('.dlq') && queue.messages >= this.dlqAlertThreshold();
  }

  private hasNoConsumerRisk(queue: RabbitQueueResponse): boolean {
    return (
      !queue.name.endsWith('.dlq') &&
      queue.messages >= this.noConsumerAlertThreshold() &&
      queue.consumers === 0
    );
  }

  private alertNote(queue: RabbitQueueResponse, alertKind: QueueAlertKind): string | undefined {
    if (alertKind === 'dlq') {
      return 'DLQ has failed events. Inspect payloads and decide whether to fix/reprocess manually.';
    }
    if (alertKind === 'no-consumer') {
      return 'Queue has waiting messages but no active consumer. Check whether the owning service is running.';
    }
    return undefined;
  }

  private alertKey(queueName: string, alertKind: QueueAlertKind): string {
    return `${alertKind}:${queueName}`;
  }

  private activeAlertKeys(queueName: string): string[] {
    return [...this.activeAlerts].filter((key) => key.endsWith(`:${queueName}`));
  }

  private alertKindFromKey(key: string): QueueAlertKind | null {
    const [kind] = key.split(':');
    return kind === 'backlog' || kind === 'dlq' || kind === 'no-consumer' ? kind : null;
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

  private dlqAlertThreshold(): number {
    return this.configService.get<number>('notificationService.queueMonitor.dlqAlertThreshold', 1);
  }

  private dlqAlertCooldownMs(): number {
    return this.configService.get<number>(
      'notificationService.queueMonitor.dlqAlertCooldownMs',
      1800000,
    );
  }

  private noConsumerAlertThreshold(): number {
    return this.configService.get<number>(
      'notificationService.queueMonitor.noConsumerAlertThreshold',
      10,
    );
  }

  private noConsumerAlertCooldownMs(): number {
    return this.configService.get<number>(
      'notificationService.queueMonitor.noConsumerAlertCooldownMs',
      600000,
    );
  }

  private alertThresholdFor(alertKind: QueueAlertKind): number {
    if (alertKind === 'dlq') {
      return this.dlqAlertThreshold();
    }
    if (alertKind === 'no-consumer') {
      return this.noConsumerAlertThreshold();
    }
    return this.alertThreshold();
  }

  private alertCooldownMsFor(alertKind: QueueAlertKind): number {
    if (alertKind === 'dlq') {
      return this.dlqAlertCooldownMs();
    }
    if (alertKind === 'no-consumer') {
      return this.noConsumerAlertCooldownMs();
    }
    return this.alertCooldownMs();
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
