import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { ERROR_CODES, HEADERS, ParsedResume, UserRole } from '@nexhire/shared';

@Injectable()
export class CandidateClientService {
  private readonly logger = new Logger(CandidateClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async applyParsedResume(params: {
    candidateId: string;
    candidateCvId: string;
    requestedByUserId: string;
    parsedResume: ParsedResume;
  }): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/v1/internal/candidates/${params.candidateId}/apply-parsed-resume`,
          {
            candidateCvId: params.candidateCvId,
            parsedResume: params.parsedResume,
          },
          this.requestOptions(params.requestedByUserId),
        ),
      );
    } catch (error) {
      throw new ServiceUnavailableException({
        code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
        message: `Failed to apply parsed resume to candidate profile: ${(error as Error).message}`,
      });
    }
  }

  async markCvParseFailed(params: {
    candidateId: string;
    candidateCvId: string;
    requestedByUserId: string;
    errorMessage: string;
  }): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/v1/internal/candidates/${params.candidateId}/cvs/${params.candidateCvId}/parse-failed`,
          { errorMessage: params.errorMessage },
          this.requestOptions(params.requestedByUserId),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to mark candidate CV parse failed for candidateCvId=${params.candidateCvId}: ${
          (error as Error).message
        }`,
      );
    }
  }

  private get baseUrl(): string {
    return this.configService.get<string>(
      'cvParsingService.services.candidateService',
      'http://localhost:3002',
    );
  }

  private requestOptions(requestedByUserId: string): {
    timeout: number;
    headers: Record<string, string>;
  } {
    const timeout = this.configService.get<number>('cvParsingService.http.timeoutMs', 30000);
    const internalServiceToken = this.configService.get<string>(
      'cvParsingService.internalServiceToken',
      'dev-internal-service-token',
    );

    return {
      timeout,
      headers: {
        [HEADERS.USER_ID]: requestedByUserId,
        [HEADERS.USER_ROLE]: UserRole.CANDIDATE,
        [HEADERS.INTERNAL_SERVICE_TOKEN]: internalServiceToken,
      },
    };
  }
}
