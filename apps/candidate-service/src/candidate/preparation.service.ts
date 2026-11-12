import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODES, HEADERS, UserRole } from '@nexhire/shared';
import { firstValueFrom } from 'rxjs';
import { CandidateService } from './candidate.service';

interface PublicJob {
  id: string;
  title: string;
  description: string | null;
  requirements: string | null;
  skills: string[];
  benefits: string | null;
  workingType: string;
  experienceLevel: string;
  location: string;
}
interface ParsedCv {
  candidateId: string;
  candidateCvId: string;
  documentId: string;
  normalizedPayload: Record<string, unknown>;
}
export interface PreparationResult {
  schemaVersion: 'candidate-preparation-v1';
  status: 'READY';
  jobId: string;
  candidateCvId: string;
  jobSnapshotSha256: string;
  cvSnapshotSha256: string;
  private: true;
  applicationCreated: false;
  candidateSupportVerified: false;
  requirements: {
    requirement: string;
    importance: string;
    status: string;
    evidence: { id: string; source: string; text: string }[];
    prompt: string;
  }[];
  warnings: string[];
}

@Injectable()
export class PreparationService {
  constructor(
    private readonly candidates: CandidateService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async prepare(userId: string, jobId: string, cvId: string): Promise<PreparationResult> {
    // Ownership before any parse-result/model lookup. Never substitute current profile for selected CV.
    const owned = await this.candidates.getPreparationSource(userId, cvId);
    const publicBase = this.config.get<string>('candidateService.services.jobService');
    const parsing = this.config.get<string>('candidateService.services.cvParsingService');
    const matching = this.config.get<string>('candidateService.services.matchingService');
    const token = this.config.get<string>('candidateService.internalServiceToken');
    if (!publicBase || !parsing || !matching || !token)
      throw new ServiceUnavailableException('Preparation dependencies unavailable');
    let job: PublicJob;
    let parsed: ParsedCv;
    try {
      // Public detail route enforces published/public visibility; no internal HR plan lookup.
      const jobResponse = await firstValueFrom(
        this.http.get<{ success: boolean; data: PublicJob }>(`${publicBase}/api/v1/jobs/${jobId}`, {
          timeout: 10000,
        }),
      );
      if (!jobResponse.data.success) throw new Error('Invalid public job');
      job = jobResponse.data.data;
    } catch {
      throw new ServiceUnavailableException({
        code: ERROR_CODES.CANDIDATE.PREPARATION_JOB_UNAVAILABLE,
        message:
          'Public job could not be loaded. Your CV does not need to be parsed again for this error.',
      });
    }
    try {
      const cvResponse = await firstValueFrom(
        this.http.get<{ success: boolean; data: ParsedCv }>(
          `${parsing}/api/v1/internal/cv-parsing/cvs/${cvId}/latest-result`,
          {
            timeout: 10000,
            headers: {
              [HEADERS.INTERNAL_SERVICE_TOKEN]: token,
              [HEADERS.USER_ID]: userId,
              [HEADERS.USER_ROLE]: UserRole.CANDIDATE,
            },
          },
        ),
      );
      if (!cvResponse.data.success) throw new Error('No parsed CV');
      parsed = cvResponse.data.data;
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        throw new BadRequestException({
          code: ERROR_CODES.CANDIDATE.PREPARATION_PARSE_MISSING,
          message:
            'The saved parse result for this CV was not found, despite its parsed status. Review the saved parsing result.',
        });
      }
      throw new ServiceUnavailableException({
        code: ERROR_CODES.CANDIDATE.PREPARATION_PARSE_UNAVAILABLE,
        message:
          'The CV parsing service could not return the saved result. Retry later; parsing again is not required for a service error.',
      });
    }
    if (
      job.id !== jobId ||
      parsed.candidateId !== owned.candidateId ||
      parsed.candidateCvId !== cvId ||
      parsed.documentId !== owned.cvDocumentId ||
      !parsed.normalizedPayload
    )
      throw new BadRequestException('Selected CV source binding is invalid');
    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; data: PreparationResult }>(
          `${matching}/api/v1/internal/candidate-preparation`,
          {
            job: {
              id: job.id,
              title: job.title,
              description: job.description ?? '',
              requirements: job.requirements ?? '',
              skills: job.skills ?? [],
              benefits: job.benefits ?? null,
              workingType: job.workingType ?? '',
              experienceLevel: job.experienceLevel ?? '',
              location: job.location ?? '',
            },
            candidate_id: owned.candidateId,
            candidate_cv_id: cvId,
            parsed_resume: parsed.normalizedPayload,
          },
          { timeout: 60000, headers: { [HEADERS.INTERNAL_SERVICE_TOKEN]: token } },
        ),
      );
      const result = response.data.data;
      if (
        !response.data.success ||
        result.schemaVersion !== 'candidate-preparation-v1' ||
        result.status !== 'READY' ||
        !/^[a-f0-9]{64}$/.test(result.jobSnapshotSha256) ||
        !/^[a-f0-9]{64}$/.test(result.cvSnapshotSha256) ||
        !Array.isArray(result.requirements) ||
        result.requirements.length < 1 ||
        result.requirements.length > 32 ||
        !Array.isArray(result.warnings) ||
        result.warnings.some(
          (w) => !['NO_EXPERIENCE_OR_PROJECT_RECORDS', 'CV_EVIDENCE_CONTEXT_TRUNCATED'].includes(w),
        ) ||
        result.jobId !== jobId ||
        result.candidateCvId !== cvId ||
        result.private !== true ||
        result.applicationCreated !== false ||
        result.candidateSupportVerified !== false
      )
        throw new Error('Invalid private preparation response');
      if (
        result.requirements.some(
          (row) =>
            typeof row.requirement !== 'string' ||
            !['REVIEW_REFERENCES', 'NO_REFERENCE_FOUND'].includes(row.status) ||
            !Array.isArray(row.evidence) ||
            row.evidence.length > 3 ||
            row.evidence.some(
              (e) =>
                typeof e.id !== 'string' ||
                typeof e.source !== 'string' ||
                typeof e.text !== 'string',
            ),
        )
      )
        throw new Error('Invalid preparation evidence');
      return result;
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 422) {
        throw new BadRequestException(
          'Public JD or parsed CV exceeds preparation bounds; this job cannot be checked automatically with the selected CV.',
        );
      }
      throw new ServiceUnavailableException(
        'Preparation unavailable. Your CV and applications have not been changed.',
      );
    }
  }
}
