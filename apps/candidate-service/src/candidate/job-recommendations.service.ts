import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthUser, HEADERS, UserRole } from '@nexhire/shared';
import { plainToInstance } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { IsNull, Repository } from 'typeorm';
import { CandidateCv } from './entities/candidate-cv.entity';
import { CandidateProfile } from './entities/candidate-profile.entity';
import { CandidateCvParseStatus } from './entities/candidate.enum';
import {
  JobRecommendationsQueryDto,
  JobRecommendationsResponse,
  RecommendationJob,
  SemanticJobRecommendationsResponse,
  SemanticRecommendationEvidence,
} from './dto/job-recommendations.dto';

type Section = { source: string; text: string };
type PublicSource = RecommendationJob & {
  description: string;
  requirements: string;
  skills: string[];
};
type Pool = {
  schemaVersion: 'public-recommendation-pool-v1';
  items: PublicSource[];
  limit: 100;
  truncated: boolean;
};
type SavedParse = {
  id: string;
  candidateId: string;
  candidateCvId: string;
  documentId: string;
  normalizedPayload: unknown;
};
type SemanticResult = {
  status: SemanticJobRecommendationsResponse['status'];
  modelVersion: string;
  indexedCount: number;
  items: { jobId: string; score: number; reasons: SemanticRecommendationEvidence[] }[];
};
const STOP = new Set(
  'a an the and or of to in on for with from as at by is are be this that have has can will we you your our no not without va và các của cho với một những được trong là có không từ về đã sẽ hoặc'.split(
    ' ',
  ),
);
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
        )
      : value;
const hash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');

@Injectable()
export class JobRecommendationsService {
  constructor(
    @InjectRepository(CandidateProfile) private readonly profiles: Repository<CandidateProfile>,
    @InjectRepository(CandidateCv) private readonly cvs: Repository<CandidateCv>,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private sections(payload: unknown): Section[] {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new ServiceUnavailableException('Saved parse payload is invalid');
    const p = payload as Record<string, unknown>,
      sections: Section[] = [];
    const add = (source: string, value: unknown) => {
      if (typeof value === 'string' && value.trim())
        sections.push({ source, text: value.slice(0, 4000) });
    };
    if (!p.profile || typeof p.profile !== 'object' || Array.isArray(p.profile))
      throw new ServiceUnavailableException('Saved parse profile is invalid');
    const profile = p.profile as Record<string, unknown>;
    add('HEADLINE', profile?.headline);
    add('SUMMARY', profile?.summary);
    // Explicit source allowlist excludes full name, contact data, employer/school names and links.
    for (const [field, source, keys] of [
      ['skills', 'SKILLS', ['name']],
      ['experiences', 'EXPERIENCE', ['position', 'description']],
      ['educations', 'EDUCATION', ['degree', 'fieldOfStudy']],
      ['certifications', 'CERTIFICATIONS', ['name', 'description']],
      ['projects', 'PROJECTS', ['name', 'description', 'technologies']],
    ] as const) {
      if (!Array.isArray(p[field]) || (p[field] as unknown[]).length > 100)
        throw new ServiceUnavailableException('Saved parse sections are invalid');
      for (const raw of p[field] as unknown[]) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
          throw new ServiceUnavailableException('Saved parse record is invalid');
        for (const key of keys) {
          const value = (raw as Record<string, unknown>)[key];
          if (key === 'technologies' && Array.isArray(value))
            value.slice(0, 100).forEach((item) => add(source, item));
          else add(source, value);
        }
      }
    }
    return sections;
  }

  private terms(sections: Section[]) {
    const terms = new Map<string, Set<string>>();
    let remaining = 24000;
    for (const section of sections) {
      const text = section.text.slice(0, Math.max(remaining, 0));
      remaining -= text.length;
      for (const term of text
        .normalize('NFKC')
        .toLowerCase()
        .match(/\.?[\p{L}\p{N}][\p{L}\p{N}+#]*(?:\.[\p{L}\p{N}][\p{L}\p{N}+#]*)*/gu) ?? []) {
        if (
          STOP.has(term) ||
          /^\p{N}+$/u.test(term) ||
          term.length > 64 ||
          (term.length < 2 && !['c', 'r'].includes(term))
        )
          continue;
        if (!terms.has(term) && terms.size >= 512) continue;
        if (!terms.has(term)) terms.set(term, new Set());
        terms.get(term)!.add(section.source);
      }
    }
    return terms;
  }

  private async get<T>(url: string, user: AuthUser, token: string, params?: object): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ success: boolean; data: T }>(url, {
          timeout: 10000,
          maxRedirects: 0,
          params,
          headers: {
            [HEADERS.INTERNAL_SERVICE_TOKEN]: token,
            [HEADERS.USER_ID]: user.id,
            [HEADERS.USER_ROLE]: UserRole.CANDIDATE,
          },
        }),
      );
      if (response.data?.success !== true) throw new Error('Invalid envelope');
      return response.data.data;
    } catch (error) {
      if (
        url.endsWith('/latest-result') &&
        (error as { response?: { status?: number } }).response?.status === 404
      )
        throw new ConflictException({
          code: 'RECOMMENDATIONS_PARSE_MISSING',
          message:
            'The selected CV has no saved parse result. Parse it explicitly before requesting recommendations.',
        });
      throw new ServiceUnavailableException({
        code: 'RECOMMENDATIONS_UNAVAILABLE',
        message:
          'Saved CV or public jobs could not be loaded. No fallback or new parsing was attempted.',
      });
    }
  }

  private validatePool(pool: Pool): PublicSource[] {
    if (
      pool?.schemaVersion !== 'public-recommendation-pool-v1' ||
      pool.limit !== 100 ||
      typeof pool.truncated !== 'boolean' ||
      !Array.isArray(pool.items) ||
      pool.items.length > 100 ||
      new Set(pool.items.map((job) => job?.id)).size !== pool.items.length
    )
      throw new ServiceUnavailableException('Public recommendation pool is invalid');
    for (const job of pool.items)
      if (
        !job ||
        !isUUID(job.id) ||
        typeof job.title !== 'string' ||
        !job.title.trim() ||
        !Number.isFinite(Date.parse(job.publishedAt)) ||
        !['companyName', 'location', 'workingType', 'experienceLevel'].every(
          (key) =>
            (job as unknown as Record<string, unknown>)[key] === null ||
            typeof (job as unknown as Record<string, unknown>)[key] === 'string',
        ) ||
        typeof job.description !== 'string' ||
        typeof job.requirements !== 'string' ||
        !Array.isArray(job.skills) ||
        job.skills.some((term) => typeof term !== 'string')
      )
        throw new ServiceUnavailableException('Public recommendation job is invalid');
    return pool.items;
  }

  private async visibleJobs(
    url: string,
    user: AuthUser,
    token: string,
    ids: string[],
  ): Promise<Map<string, PublicSource>> {
    if (!ids.length) return new Map();
    const pool = await this.get<Pool>(url, user, token, { ids: ids.join(',') });
    return new Map(this.validatePool(pool).map((job) => [job.id, job]));
  }

  private async recommendSemantic(
    user: AuthUser,
    token: string,
    cv: CandidateCv,
    parsed: SavedParse,
    parseUrl: string,
    jobsUrl: string,
    cvSections: Section[],
    pool: Pool,
    jobs: PublicSource[],
    limit: number,
  ): Promise<SemanticJobRecommendationsResponse> {
    const matchingBase = this.config.get<string>('candidateService.services.matchingService');
    const unavailable = () =>
      new ServiceUnavailableException({
        code: 'RECOMMENDATIONS_UNAVAILABLE',
        message: 'Semantic job recommendations are temporarily unavailable.',
      });
    if (!matchingBase) throw unavailable();

    const clip = (value: string, length: number) =>
      value.length <= length ? value : Array.from(value).slice(0, length).join('');
    const sections = [
      ...cvSections.filter(({ source }) => source === 'HEADLINE' || source === 'SUMMARY'),
      ...cvSections.filter(({ source }) => source === 'EXPERIENCE').slice(0, 6),
      ...cvSections.filter(({ source }) => source === 'PROJECTS').slice(0, 3),
    ];
    for (const source of ['SKILLS', 'EDUCATION', 'CERTIFICATIONS']) {
      const text = cvSections
        .filter((section) => section.source === source)
        .map((s) => s.text)
        .join('\n');
      if (text) sections.push({ source, text: clip(text, 4000) });
    }
    const modelSections = sections.slice(0, 12);
    const modelJobs = jobs.map(({ id, title, description, requirements, skills, publishedAt }) => ({
      id,
      title: clip(title, 255),
      description: clip(description, 12000),
      requirements: clip(requirements, 8000),
      skills: skills.slice(0, 50).map((skill) => clip(skill, 80)),
      publishedAt: new Date(publishedAt).toISOString(),
    }));

    let semantic: SemanticResult;
    try {
      const { data } = await firstValueFrom(
        this.http.post<{ success: boolean; data: SemanticResult }>(
          `${matchingBase}/api/v1/internal/job-recommendations`,
          { limit, sections: modelSections, jobs: modelJobs },
          { timeout: 6500, maxRedirects: 0, headers: { [HEADERS.INTERNAL_SERVICE_TOKEN]: token } },
        ),
      );
      if (data?.success !== true) throw unavailable();
      semantic = data.data;
    } catch {
      throw unavailable();
    }
    const statuses = ['READY', 'READY_PARTIAL', 'EMPTY', 'INDEX_WARMING'];
    if (
      !semantic ||
      !statuses.includes(semantic.status) ||
      typeof semantic.modelVersion !== 'string' ||
      !semantic.modelVersion.trim() ||
      semantic.modelVersion.length > 160 ||
      !Number.isInteger(semantic.indexedCount) ||
      semantic.indexedCount < 0 ||
      semantic.indexedCount > jobs.length ||
      !Array.isArray(semantic.items) ||
      semantic.items.length > Math.min(limit, semantic.indexedCount) ||
      semantic.items.length > 0 !==
        (semantic.status === 'READY' || semantic.status === 'READY_PARTIAL') ||
      (semantic.status === 'READY' && semantic.indexedCount !== jobs.length) ||
      (semantic.status === 'READY_PARTIAL' && semantic.indexedCount >= jobs.length) ||
      (semantic.status === 'EMPTY' && jobs.length > 0 && modelSections.length > 0)
    )
      throw unavailable();

    const toComparableText = (text: string) => text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    const containsQuote = (text: string, quote: string) =>
      toComparableText(text).includes(toComparableText(quote));
    const inputs = new Map(modelJobs.map((job) => [job.id, job]));
    const jobById = new Map(jobs.map((job) => [job.id, job]));
    const ids = new Set<string>();
    let previousScore = Infinity;
    for (const item of semantic.items) {
      const job = inputs.get(item?.jobId);
      if (
        !job ||
        ids.has(item.jobId) ||
        !Number.isFinite(item.score) ||
        Math.abs(item.score) > 1.000001 ||
        item.score > previousScore ||
        !Array.isArray(item.reasons) ||
        item.reasons.length > 2
      )
        throw unavailable();
      for (const reason of item.reasons) {
        if (
          !reason ||
          typeof reason.cvText !== 'string' ||
          !reason.cvText.trim() ||
          reason.cvText.length > 1200 ||
          typeof reason.jobText !== 'string' ||
          !reason.jobText.trim() ||
          reason.jobText.length > 1200 ||
          !modelSections.some(
            (section) =>
              section.source === reason.cvSource && containsQuote(section.text, reason.cvText),
          ) ||
          ![job.title, job.requirements, job.description, ...job.skills].some((text) =>
            containsQuote(text, reason.jobText),
          )
        )
          throw unavailable();
      }
      previousScore = item.score;
      ids.add(item.jobId);
    }

    const cvSnapshotSha256 = hash(cvSections);
    const [visible, currentCv, currentParse] = await Promise.all([
      this.visibleJobs(jobsUrl, user, token, [...ids]),
      this.cvs.findOne({
        where: { id: cv.id, candidateId: parsed.candidateId, deletedAt: IsNull() },
      }),
      this.get<SavedParse>(parseUrl, user, token),
    ]);
    if (
      !currentCv ||
      currentCv.documentDeletedAt ||
      currentCv.documentId !== cv.documentId ||
      currentCv.parseStatus !== CandidateCvParseStatus.PARSED ||
      currentParse?.id !== parsed.id ||
      currentParse.documentId !== cv.documentId ||
      currentParse.candidateId !== parsed.candidateId ||
      currentParse.candidateCvId !== cv.id ||
      hash(this.sections(currentParse.normalizedPayload)) !== cvSnapshotSha256
    )
      throw new ConflictException({
        code: 'RECOMMENDATIONS_SOURCE_CHANGED',
        message: 'Selected CV changed. Reload before requesting recommendations.',
      });

    const items: SemanticJobRecommendationsResponse['items'] = [];
    for (const row of semantic.items) {
      const currentJob = visible.get(row.jobId);
      if (!currentJob || hash(currentJob) !== hash(jobById.get(row.jobId))) continue;
      const { id, title, companyName, location, workingType, experienceLevel, publishedAt } =
        currentJob;
      items.push({
        rank: items.length + 1,
        semanticScore: row.score,
        evidence: row.reasons.map(({ cvSource, cvText, jobText }) => ({
          cvSource,
          cvText,
          jobText,
        })),
        job: { id, title, companyName, location, workingType, experienceLevel, publishedAt },
      });
    }
    const shortlistChanged = items.length < semantic.items.length;
    if (shortlistChanged && !items.length)
      throw new ConflictException({
        code: 'RECOMMENDATIONS_SOURCE_CHANGED',
        message:
          'Public jobs changed during recommendation. Reload to use the current public pool.',
      });

    return {
      schemaVersion: 'candidate-job-recommendations-v2',
      method: 'M1_REQUIREMENT_SEMANTIC_V1',
      scoreMeaning: 'RELATIVE_SEMANTIC_SIMILARITY',
      status: semantic.status,
      reason:
        semantic.status === 'INDEX_WARMING'
          ? 'JD_INDEX_PENDING'
          : semantic.status === 'EMPTY'
            ? jobs.length
              ? 'CV_TEXT_EMPTY'
              : 'NO_PUBLIC_JOBS'
            : null,
      modelVersion: semantic.modelVersion,
      candidateCvId: cv.id,
      parseResultId: parsed.id,
      cvSnapshotSha256,
      sourceCheckedAt: new Date().toISOString(),
      pool: {
        limit: 100,
        considered: jobs.length,
        indexed: semantic.indexedCount,
        truncated: pool.truncated,
        order: 'PUBLISHED_AT_DESC_ID_ASC',
      },
      items,
      fitScore: null,
      candidateSupportVerified: false,
      applicationCreated: false,
      warnings: [
        'SEMANTIC_SIMILARITY_DOES_NOT_PROVE_SUPPORT',
        ...(shortlistChanged ? ['SHORTLIST_CHANGED_DURING_READ'] : []),
      ],
    };
  }

  async recommend(
    user: AuthUser,
    cvId: string,
    input: JobRecommendationsQueryDto,
  ): Promise<JobRecommendationsResponse> {
    if (user?.role !== UserRole.CANDIDATE || !isUUID(user.id)) throw new ForbiddenException();
    const query = plainToInstance(JobRecommendationsQueryDto, input);
    if (
      !isUUID(cvId) ||
      validateSync(query, { whitelist: true, forbidNonWhitelisted: true }).length
    )
      throw new BadRequestException('Invalid recommendation query');
    const profile = await this.profiles.findOne({ where: { userId: user.id } });
    const cv = profile
      ? await this.cvs.findOne({
          where: { id: cvId, candidateId: profile.id, deletedAt: IsNull() },
        })
      : null;
    if (!profile || !cv || cv.documentDeletedAt)
      throw new NotFoundException('Selected CV not found');
    if (cv.parseStatus !== CandidateCvParseStatus.PARSED)
      throw new ConflictException({
        code: 'RECOMMENDATIONS_PARSE_REQUIRED',
        message: 'Parse your selected CV before requesting job recommendations.',
      });
    const parser = this.config.get<string>('candidateService.services.cvParsingService'),
      jobsBase = this.config.get<string>('candidateService.services.jobService'),
      token = this.config.get<string>('candidateService.internalServiceToken');
    if (!parser || !jobsBase || !token)
      throw new ServiceUnavailableException('Recommendation dependencies unavailable');
    const parseUrl = `${parser}/api/v1/internal/cv-parsing/cvs/${cvId}/latest-result`;
    const jobsUrl = `${jobsBase}/api/v1/internal/jobs/recommendation-pool`;
    const parsed = await this.get<SavedParse>(parseUrl, user, token);
    if (
      !isUUID(parsed?.id) ||
      parsed.candidateId !== profile.id ||
      parsed.candidateCvId !== cvId ||
      parsed.documentId !== cv.documentId
    )
      throw new ServiceUnavailableException('Selected CV parse source binding changed');
    const cvSections = this.sections(parsed.normalizedPayload);
    const pool = await this.get<Pool>(jobsUrl, user, token);
    const jobs = this.validatePool(pool);
    if (this.config.get<boolean>('candidateService.recommendations.semanticEnabled') === true) {
      return this.recommendSemantic(
        user,
        token,
        cv,
        parsed,
        parseUrl,
        jobsUrl,
        cvSections,
        pool,
        jobs,
        query.limit,
      );
    }

    const cvTerms = this.terms(cvSections);
    const ranked = jobs
      .map((job) => {
        const jobTerms = this.terms([
          { source: 'TITLE', text: job.title },
          { source: 'SKILLS', text: job.skills.join(' ') },
          { source: 'REQUIREMENTS', text: job.requirements },
          { source: 'DESCRIPTION', text: job.description },
        ]);
        const matches = [...jobTerms.keys()].filter((term) => cvTerms.has(term)).sort();
        return {
          keywordScore: matches.length,
          matchedTerms: matches.slice(0, 20).map((term) => ({
            term,
            cvSources: [...cvTerms.get(term)!].sort(),
            jobSources: [...jobTerms.get(term)!].sort(),
          })),
          job,
        };
      })
      .filter((item) => item.keywordScore > 0)
      .sort(
        (a, b) =>
          b.keywordScore - a.keywordScore ||
          Date.parse(b.job.publishedAt) - Date.parse(a.job.publishedAt) ||
          (a.job.id < b.job.id ? -1 : a.job.id > b.job.id ? 1 : 0),
      )
      .slice(0, query.limit);
    // Recheck shortlisted jobs against the same visibility query, without replacing hidden jobs with search results.
    const visible = await this.visibleJobs(
      jobsUrl,
      user,
      token,
      ranked.map((item) => item.job.id),
    );
    const currentCv = await this.cvs.findOne({
      where: { id: cvId, candidateId: profile.id, deletedAt: IsNull() },
    });
    if (
      !currentCv ||
      currentCv.documentDeletedAt ||
      currentCv.documentId !== cv.documentId ||
      currentCv.parseStatus !== CandidateCvParseStatus.PARSED ||
      String(currentCv.parsedAt) !== String(cv.parsedAt)
    )
      throw new ConflictException('Selected CV changed. Reload before requesting recommendations.');
    const items = ranked
      .filter(
        (item) => visible.has(item.job.id) && hash(visible.get(item.job.id)) === hash(item.job),
      )
      .map((item, index) => ({
        rank: index + 1,
        keywordScore: item.keywordScore,
        matchedTerms: item.matchedTerms,
        job: {
          id: item.job.id,
          title: item.job.title,
          companyName: item.job.companyName,
          location: item.job.location,
          workingType: item.job.workingType,
          experienceLevel: item.job.experienceLevel,
          publishedAt: item.job.publishedAt,
        },
      }));
    if (ranked.length && !items.length)
      throw new ConflictException({
        code: 'RECOMMENDATIONS_SOURCE_CHANGED',
        message:
          'Public jobs changed during recommendation. Reload to use the current public pool.',
      });
    return {
      schemaVersion: 'candidate-job-recommendations-v1',
      method: 'KEYWORD_OVERLAP_V1',
      scoreMeaning: 'DISTINCT_SHARED_TERMS_NOT_FIT_OR_SUPPORT',
      status: items.length ? 'READY' : 'EMPTY',
      reason: items.length
        ? null
        : !jobs.length
          ? 'NO_PUBLIC_JOBS'
          : !cvTerms.size
            ? 'CV_TEXT_EMPTY'
            : 'NO_KEYWORD_OVERLAP',
      candidateCvId: cvId,
      parseResultId: parsed.id,
      cvSnapshotSha256: hash(cvSections),
      sourceCheckedAt: new Date().toISOString(),
      pool: {
        limit: 100,
        considered: jobs.length,
        truncated: pool.truncated,
        order: 'PUBLISHED_AT_DESC_ID_ASC',
      },
      items,
      fitScore: null,
      candidateSupportVerified: false,
      applicationCreated: false,
      warnings: [
        'KEYWORD_BASELINE_NOT_SEMANTIC',
        'LEXICAL_OVERLAP_DOES_NOT_RESOLVE_NEGATION_OR_PROVE_SUPPORT',
        'BOUNDED_CV_TEXT_24000_CHARS_512_TERMS',
        ...(ranked.length !== items.length ? ['SHORTLIST_CHANGED_DURING_READ'] : []),
      ],
    };
  }
}
