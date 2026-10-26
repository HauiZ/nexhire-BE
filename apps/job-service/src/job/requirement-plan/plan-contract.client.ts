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
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; data: PlanInspection }>(
          `${base}/api/v1/internal/jd-plans/${operation}`,
          body,
          {
            timeout: this.config.get<number>('jobService.http.timeoutMs', 5000),
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
