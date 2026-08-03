import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HEADERS, UserRole } from '@nexhire/shared';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface AdminNotificationRecipient {
  id: string;
  email: string;
  fullName: string | null;
}

@Injectable()
export class AdminRecipientClientService {
  private readonly logger = new Logger(AdminRecipientClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async listAdminRecipients(): Promise<AdminNotificationRecipient[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<ApiEnvelope<AdminNotificationRecipient[]>>(
          `${this.authServiceUrl}/api/v1/internal/auth/admin-notification-recipients`,
          {
            timeout: this.timeoutMs,
            headers: {
              [HEADERS.INTERNAL_SERVICE_TOKEN]: this.internalServiceToken,
              [HEADERS.USER_ID]: 'notification-service',
              [HEADERS.USER_ROLE]: UserRole.ADMIN,
            },
          },
        ),
      );
      return response.data.data;
    } catch (error) {
      const detail = error instanceof AxiosError ? error.message : String(error);
      this.logger.error(`Failed to list admin notification recipients: ${detail}`);
      throw error;
    }
  }

  private get authServiceUrl(): string {
    return this.configService.get<string>(
      'notificationService.services.authService',
      'http://localhost:3001',
    );
  }

  private get timeoutMs(): number {
    return this.configService.get<number>('notificationService.http.timeoutMs', 5000);
  }

  private get internalServiceToken(): string {
    return this.configService.get<string>(
      'notificationService.internalServiceToken',
      'dev-internal-service-token',
    );
  }
}
