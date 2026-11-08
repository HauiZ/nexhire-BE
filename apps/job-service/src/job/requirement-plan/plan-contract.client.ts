import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HEADERS } from '@nexhire/shared';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { PlanInspection } from './requirement-plan.dto';

@Injectable()
export class PlanContractClient {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}
  async call(operation: 'draft' | 'validate' | 'inspect', body: object): Promise<PlanInspection> {
    const base = this.config.get<string>('jobService.services.matchingService');
    const token = this.config.get<string>('jobService.internalServiceToken');
    if (!base || !token)
      throw new ServiceUnavailableException('JD plan validator is not configured');
    try {
      const payload = body as { schema_version?: string; plan?: { schema_version?: string } };
      const v2 = (payload.plan?.schema_version ?? payload.schema_version) === 'jd-source-query-v2';
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; data: PlanInspection }>(
          `${base}/api/v1/internal/jd-plans/${v2 ? 'v2/' : ''}${operation}`,
          body,
          {
            // First v2 preflight imports and verifies the pinned local tokenizer.
            timeout: v2
              ? Math.max(this.config.get<number>('jobService.http.timeoutMs', 5000), 30000)
              : this.config.get<number>('jobService.http.timeoutMs', 5000),
            headers: { [HEADERS.INTERNAL_SERVICE_TOKEN]: token },
          },
        ),
      );
      if (!response.data.success || !response.data.data)
        throw new Error('Invalid validator envelope');
      return response.data.data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 422) {
        throw new BadRequestException('Invalid or stale JD requirement plan');
      }
      throw new ServiceUnavailableException(
        'JD plan validator unavailable; job publishing is unaffected',
      );
    }
  }
}
