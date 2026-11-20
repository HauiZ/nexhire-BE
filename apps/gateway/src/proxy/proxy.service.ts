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
    const url = `${baseUrl}${req.originalUrl.split('?')[0]}`;
    const user = req.user as AuthUser | undefined;
    const contentType = req.headers['content-type'] ?? 'application/json';
    const isMultipart = contentType.includes('multipart/form-data');
    const timeout = this.getTimeout(service, req);
    if (this.isJobRecommendationRead(service, req))
      res.setHeader('Cache-Control', 'private, no-store');

    try {
      const response = await firstValueFrom(
        this.http.request({
          method: req.method as never,
          url,
          data: isMultipart ? req : req.body,
          params: req.query,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout,
          headers: {
            'content-type': contentType,
            [HEADERS.REQUEST_ID]: (req.headers[HEADERS.REQUEST_ID] as string) ?? '',
            ...(user
              ? {
                  [HEADERS.USER_ID]: user.id,
                  [HEADERS.USER_ROLE]: user.role,
                  ...(user.companyId ? { [HEADERS.COMPANY_ID]: user.companyId } : {}),
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

  private getTimeout(service: ServiceKey, req: Request): number {
    // Candidate Service reads parse data and the public pool, then rechecks
    // visibility. Semantic matching adds a separate upstream call.
    if (this.isJobRecommendationRead(service, req)) return 40_000;
    if (
      service === 'applicationService' &&
      req.method === 'GET' &&
      (/^\/api\/v1\/recruiter\/applications\/[^/]+\/(?:ranking-score|ai2-demo|ai2-pool)\/?$/.test(
        req.path,
      ) ||
        /^\/api\/v1\/recruiter\/jobs\/[^/]+\/application-rankings\/?$/.test(req.path))
    ) {
      // AI2 reads the Matching Service and then rechecks the current job plan.
      return 25_000;
    }
    if (
      service === 'candidateService' &&
      req.method === 'POST' &&
      /^\/api\/v1\/candidates\/me\/cvs\/[^/]+\/jobs\/[^/]+\/preparation$/.test(req.path)
    )
      return 85_000;

    if (service === 'jobService') {
      const planRoute =
        /^\/api\/v1\/recruiter\/jobs\/[^/]+\/requirement-plan(?:\/(drafts|confirm))?\/?$/.exec(
          req.path,
        );
      if (planRoute) {
        const action = planRoute[1];
        // The v2 contract allows 30 seconds per Matching Service call. Editing
        // and confirming each make two calls before the transaction commits.
        if ((req.method === 'PATCH' && !action) || (req.method === 'POST' && action === 'confirm'))
          return 65_000;
        if ((req.method === 'GET' && !action) || (req.method === 'POST' && action === 'drafts'))
          return 35_000;
      }
    }

    return service === 'cvParsingService' || service === 'matchingService' ? 30_000 : 5_000;
  }

  private isJobRecommendationRead(service: ServiceKey, req: Request): boolean {
    return (
      service === 'candidateService' &&
      req.method === 'GET' &&
      /^\/api\/v1\/candidates\/me\/cvs\/[^/]+\/job-recommendations\/?$/.test(req.path)
    );
  }
}
