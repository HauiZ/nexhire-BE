import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { AuthUser, HEADERS } from '@nexhire/shared';

type ServiceKey =
  | 'authService'
  | 'candidateService'
  | 'companyService'
  | 'jobService'
  | 'applicationService'
  | 'cvParsingService'
  | 'matchingService'
  | 'notificationService'
  | 'documentStorageService';

/**
 * Forwards an incoming request to an internal service, injecting the
 * authenticated identity as headers. Internal services trust these headers.
 */
@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async forward(service: ServiceKey, req: Request, res: Response): Promise<void> {
    const baseUrl = this.config.get<string>(`gateway.services.${service}`);
    const url = `${baseUrl}${req.originalUrl}`;
    const user = req.user as AuthUser | undefined;

    try {
      const response = await firstValueFrom(
        this.http.request({
          method: req.method as never,
          url,
          data: req.body,
          params: req.query,
          timeout:
            service === 'cvParsingService' || service === 'matchingService'
              ? 30_000
              : 5_000,
          headers: {
            'content-type': req.headers['content-type'] ?? 'application/json',
            [HEADERS.REQUEST_ID]: (req.headers[HEADERS.REQUEST_ID] as string) ?? '',
            ...(user
              ? {
                  [HEADERS.USER_ID]: user.id,
                  [HEADERS.USER_ROLE]: user.role,
                  ...(user.companyId ? { 'x-company-id': user.companyId } : {}),
                }
              : {}),
          },
        }),
      );
      res.status(response.status).json(response.data);
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response) {
        res.status(axiosErr.response.status).json(axiosErr.response.data);
        return;
      }
      this.logger.error(`Proxy to ${service} failed: ${axiosErr.message}`);
      throw new HttpException('Upstream service unavailable', 503);
    }
  }
}
