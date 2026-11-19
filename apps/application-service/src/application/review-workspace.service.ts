import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthUser, UserRole } from '@nexhire/shared';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { plainToInstance, ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Application } from './entities/application.entity';
import {
  ApplicationReview,
  StoredRequirementReview,
  StoredSupportJudgment,
} from './entities/application-review.entity';
import { ApplicationService } from './application.service';
import {
  SaveReviewWorkspaceDto,
  SubmitSupportJudgmentsDto,
  ReviewSupportJudgmentsDto,
  SupportExportReadinessDto,
  SUPPORT_TARGET_VERSION,
} from './dto/review-workspace.dto';

type CurrentReview = NonNullable<
  Awaited<ReturnType<ApplicationService['getCompanyApplicationHrReview']>>
>;
type SourceRequirement = CurrentReview['requirements'][number];
// Feedback digest contract: recursively sorted object keys, original array order.
// JSONB may reorder object keys on persistence; model/snapshot digest contracts are unchanged.
const canonicalFeedbackJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalFeedbackJson);
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonicalFeedbackJson(object[key])]),
    );
  }
  return value;
};
const sha256 = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalFeedbackJson(value)))
    .digest('hex');

@Injectable()
export class ReviewWorkspaceService {
  constructor(
    @InjectRepository(Application) private readonly applications: Repository<Application>,
    @InjectRepository(ApplicationReview) private readonly reviews: Repository<ApplicationReview>,
    private readonly applicationService: ApplicationService,
  ) {}

  private async authorize(user: AuthUser, id: string): Promise<void> {
    if (user.role !== UserRole.RECRUITER || !user.companyId) throw new ForbiddenException();
    if (!(await this.applications.findOne({ where: { id, companyId: user.companyId } }))) {
      throw new NotFoundException('Application not found');
    }
  }

  async read(user: AuthUser, id: string) {
    await this.authorize(user, id);
    const document = await this.reviews.findOne({
      where: { applicationId: id },
      order: { revision: 'DESC' },
    });
    let current: Awaited<ReturnType<ApplicationService['getCompanyApplicationHrReview']>> = null;
    let freshnessUnavailable = false;
    try {
      current = await this.applicationService.getCompanyApplicationHrReview(user, id);
    } catch (error) {
      if ((error as { getStatus?: () => number }).getStatus?.() !== 503) throw error;
      freshnessUnavailable = true;
    }
    const stale =
      !!document &&
      (!current ||
        current.resultId !== document.resultId ||
        current.jobSnapshotSha256 !== document.jobSnapshotSha256 ||
        current.candidateSnapshotSha256 !== document.candidateSnapshotSha256 ||
        document.requirements?.some(
          (row) =>
            row.supportJudgment && !this.matches(row.supportJudgment, current!, row.requirementId),
        ));
    return {
      schemaVersion: 'hr-workspace-v1',
      document,
      stale,
      freshnessUnavailable,
      bindingScope: 'LATEST_MATCHING_RESULT',
      isTrainingLabel: false,
      hiringDecision: null,
    };
  }

  async save(user: AuthUser, id: string, dto: SaveReviewWorkspaceDto) {
    await this.authorize(user, id);
    // HTTP validation is not a security boundary for direct service callers.
    this.keys(dto, [
      'expectedRevision',
      'resultId',
      'jobSnapshotSha256',
      'candidateSnapshotSha256',
      'requirements',
      'questions',
      'interviewStatus',
    ]);
    for (const row of dto.requirements)
      this.keys(row, ['requirementId', 'status', 'note', 'evidenceIds']);
    for (const row of dto.questions)
      this.keys(row, ['id', 'requirementId', 'question', 'answer', 'note']);
    const current = await this.applicationService.getCompanyApplicationHrReview(user, id);
    if (
      !current ||
      current.assessmentStatus !== 'PENDING_REVIEW' ||
      current.resultId !== dto.resultId ||
      current.jobSnapshotSha256 !== dto.jobSnapshotSha256 ||
      current.candidateSnapshotSha256 !== dto.candidateSnapshotSha256
    ) {
      throw new ConflictException(
        'Matching evidence changed or is unavailable. Reload before reviewing.',
      );
    }
    const sources = new Map(current.requirements.map((r) => [r.requirementId, r]));
    if (
      new Set(dto.requirements.map((r) => r.requirementId)).size !== dto.requirements.length ||
      new Set(dto.questions.map((q) => q.id)).size !== dto.questions.length
    ) {
      throw new BadRequestException('Duplicate review or question identity');
    }
    for (const row of dto.requirements) {
      const source = sources.get(row.requirementId);
      const evidence = new Set(source?.evidence.map((e) => e.evidenceId));
      if (
        !source ||
        new Set(row.evidenceIds).size !== row.evidenceIds.length ||
        row.evidenceIds.some((e) => !evidence.has(e))
      )
        throw new BadRequestException('Review evidence is not in the bound requirement');
    }
    if (
      dto.questions.some(
        (q) => !q.question.trim() || (q.requirementId && !sources.has(q.requirementId)),
      )
    ) {
      throw new BadRequestException('Questions require text and a valid optional requirement');
    }
    if (
      dto.interviewStatus === 'COMPLETED' &&
      (!dto.questions.length || dto.questions.some((q) => !q.answer.trim()))
    ) {
      throw new BadRequestException('Complete each interview answer before completing the sheet');
    }
    // Append-only revisions preserve reviewer history. The composite primary key
    // arbitrates concurrent saves; no last-write-wins overwrite is allowed.
    const { expectedRevision } = dto;
    const latest = await this.reviews.findOne({
      where: { applicationId: id },
      order: { revision: 'DESC' },
    });
    if ((latest?.revision ?? 0) !== expectedRevision)
      throw new ConflictException('Another reviewer saved changes. Reload before saving.');
    const values = {
      resultId: dto.resultId,
      jobSnapshotSha256: dto.jobSnapshotSha256,
      candidateSnapshotSha256: dto.candidateSnapshotSha256,
      requirements: this.carryJudgments(
        dto.requirements.map((row) => ({
          requirementId: row.requirementId,
          status: row.status,
          note: row.note,
          evidenceIds: [...row.evidenceIds],
        })),
        latest,
        current,
      ),
      questions: dto.questions.map((row) => ({
        id: row.id,
        requirementId: row.requirementId,
        question: row.question,
        answer: row.answer,
        note: row.note,
      })),
      interviewStatus: dto.interviewStatus,
      applicationId: id,
      revision: expectedRevision + 1,
      sourceRequirements: current.requirements.map((r) => ({
        requirementId: r.requirementId,
        text: r.text,
        evidence: r.evidence.map((e) => ({
          evidenceId: e.evidenceId,
          text: e.text,
          source: e.source,
        })),
      })),
      reviewerId: user.id,
      updatedAt: new Date(),
    };
    try {
      await this.reviews.insert(values);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('Another reviewer saved changes. Reload before saving.');
      throw error;
    }
    return {
      schemaVersion: 'hr-workspace-v1',
      document: values,
      stale: false,
      bindingScope: 'LATEST_MATCHING_RESULT',
      isTrainingLabel: false,
      hiringDecision: null,
    };
  }

  private keys(value: object, allowed: string[]) {
    if (!value || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key)))
      throw new BadRequestException('Unknown workspace fields');
  }

  private input<T extends object>(type: ClassConstructor<T>, value: T): T {
    const dto = plainToInstance(type, value);
    if (
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true })
        .length
    )
      throw new BadRequestException('Invalid support feedback input');
    return dto;
  }

  private async latest(id: string, revision: number) {
    const row = await this.reviews.findOne({
      where: { applicationId: id },
      order: { revision: 'DESC' },
    });
    if ((row?.revision ?? 0) !== revision)
      throw new ConflictException('Another reviewer saved changes. Reload before saving.');
    return row;
  }

  private bound(
    current: CurrentReview | null,
    content: { resultId: string; jobSnapshotSha256: string; candidateSnapshotSha256: string },
  ) {
    if (
      !current ||
      current.assessmentStatus !== 'PENDING_REVIEW' ||
      current.resultId !== content.resultId ||
      current.jobSnapshotSha256 !== content.jobSnapshotSha256 ||
      current.candidateSnapshotSha256 !== content.candidateSnapshotSha256
    )
      throw new ConflictException(
        'Matching evidence changed or is unavailable. Reload before reviewing.',
      );
    return current;
  }

  private binding(
    current: CurrentReview,
    source: SourceRequirement,
  ): StoredSupportJudgment['binding'] {
    if (
      current.executionStatus !== 'SUCCEEDED' ||
      current.scope !== 'RETRIEVED_EVIDENCE_ONLY' ||
      current.planStateScope !== 'AT_MATCHING_TIME' ||
      current.currentPlanRevalidated !== false ||
      !current.retrievalModelVersion?.trim() ||
      !/^[a-f0-9]{64}$/.test(current.planContentSha256 ?? '') ||
      !/^[a-f0-9]{64}$/.test(current.jobSnapshotSha256 ?? '') ||
      !/^[a-f0-9]{64}$/.test(current.candidateSnapshotSha256 ?? '')
    )
      throw new ConflictException(
        'Source/model provenance is unavailable. Reload before reviewing.',
      );
    return {
      resultId: current.resultId,
      jobSnapshotSha256: current.jobSnapshotSha256!,
      candidateSnapshotSha256: current.candidateSnapshotSha256!,
      planContentSha256: current.planContentSha256,
      retrievalModelVersion: current.retrievalModelVersion,
      verifierModelVersion: current.verifierModelVersion ?? null,
      assessmentSource: current.assessmentSource ?? null,
      requirementTextSha256: sha256(source.text),
      evidenceTextSha256: sha256(
        source.evidence.map((e) => ({ evidenceId: e.evidenceId, text: e.text, source: e.source })),
      ),
      sourceScope: 'RETRIEVED_EVIDENCE_ONLY',
      planStateScope: 'AT_MATCHING_TIME',
      currentPlanRevalidated: false,
      freshness: 'SNAPSHOT_AT_CHECK_TIME',
    };
  }

  private contentHash(
    judgment: Pick<
      StoredSupportJudgment,
      'targetVersion' | 'label' | 'evidenceIds' | 'rationale' | 'uncertain' | 'binding'
    >,
  ) {
    return sha256({
      targetVersion: judgment.targetVersion,
      label: judgment.label,
      evidenceIds: judgment.evidenceIds,
      rationale: judgment.rationale,
      uncertain: judgment.uncertain,
      binding: judgment.binding,
    });
  }

  private matches(judgment: StoredSupportJudgment, current: CurrentReview, requirementId: string) {
    const source = current.requirements.find((row) => row.requirementId === requirementId);
    if (!source) return false;
    try {
      return (
        sha256(judgment.binding) === sha256(this.binding(current, source)) &&
        judgment.submission.contentSha256 === this.contentHash(judgment)
      );
    } catch (error) {
      if (error instanceof ConflictException) return false;
      throw error;
    }
  }

  private workflow(
    judgment: Pick<StoredSupportJudgment, 'uncertain' | 'label'>,
    reset = false,
  ): StoredSupportJudgment['workflow'] {
    const hold = judgment.uncertain || judgment.label === 'INSUFFICIENT_CONTEXT';
    return {
      state: hold ? 'HOLD' : 'SUBMITTED',
      holdReasons: hold ? ['UNCERTAIN_OR_INSUFFICIENT_CONTEXT'] : [],
      checkedAt: new Date().toISOString(),
      ...(reset ? { approvalResetReason: 'WORKSPACE_REVISION_CHANGED' as const } : {}),
    };
  }

  private carryJudgments(
    rows: StoredRequirementReview[],
    latest: ApplicationReview | null,
    current: CurrentReview,
  ) {
    for (const old of latest?.requirements ?? []) {
      if (!old.supportJudgment || !this.matches(old.supportJudgment, current, old.requirementId))
        continue;
      let row = rows.find((item) => item.requirementId === old.requirementId);
      if (!row) {
        row = { requirementId: old.requirementId, status: 'UNREVIEWED', note: '', evidenceIds: [] };
        rows.push(row);
      }
      const copied: StoredSupportJudgment = JSON.parse(JSON.stringify(old.supportJudgment));
      copied.workflow = this.workflow(copied, true);
      if (old.supportJudgment.workflow.state === 'HOLD') {
        copied.workflow.state = 'HOLD';
        copied.workflow.holdReasons = [...old.supportJudgment.workflow.holdReasons];
      }
      row.supportJudgment = copied;
    }
    return rows;
  }

  private async append(
    user: AuthUser,
    id: string,
    revision: number,
    current: CurrentReview,
    requirements: StoredRequirementReview[],
    latest: ApplicationReview | null,
  ) {
    const document = {
      applicationId: id,
      revision: revision + 1,
      resultId: current.resultId,
      jobSnapshotSha256: current.jobSnapshotSha256!,
      candidateSnapshotSha256: current.candidateSnapshotSha256!,
      sourceRequirements: current.requirements.map((row) => ({
        requirementId: row.requirementId,
        text: row.text,
        evidence: row.evidence.map((e) => ({
          evidenceId: e.evidenceId,
          text: e.text,
          source: e.source,
        })),
      })),
      requirements,
      questions: latest?.questions ?? [],
      interviewStatus: latest?.interviewStatus ?? ('DRAFT' as const),
      reviewerId: user.id,
      updatedAt: new Date(),
    };
    try {
      await this.reviews.insert(document);
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('Another reviewer saved changes. Reload before saving.');
      throw error;
    }
    return {
      schemaVersion: 'hr-workspace-v1',
      document,
      stale: false,
      bindingScope: 'LATEST_MATCHING_RESULT',
      isTrainingLabel: false,
      hiringDecision: null,
    };
  }

  async submitSupportJudgments(user: AuthUser, id: string, input: SubmitSupportJudgmentsDto) {
    await this.authorize(user, id);
    const dto = this.input(SubmitSupportJudgmentsDto, input);
    if (new Set(dto.judgments.map((row) => row.requirementId)).size !== dto.judgments.length)
      throw new BadRequestException('Duplicate support requirement');
    const current = this.bound(
      await this.applicationService.getCompanyApplicationHrReview(user, id),
      dto,
    );
    const latest = await this.latest(id, dto.expectedRevision);
    if (latest) this.bound(current, latest);
    const rows = this.carryJudgments(
      (latest?.requirements ?? []).map((row) => ({
        requirementId: row.requirementId,
        status: row.status,
        note: row.note,
        evidenceIds: [...row.evidenceIds],
      })),
      latest,
      current,
    );
    for (const item of dto.judgments) {
      const source = current.requirements.find((row) => row.requirementId === item.requirementId);
      if (
        !source ||
        new Set(item.evidenceIds).size !== item.evidenceIds.length ||
        item.evidenceIds.some((key) => !source.evidence.some((e) => e.evidenceId === key)) ||
        (item.label !== 'INSUFFICIENT_CONTEXT' && !item.evidenceIds.length)
      )
        throw new BadRequestException('Judgment requires evidence from its bound requirement');
      const content = {
        targetVersion: SUPPORT_TARGET_VERSION,
        label: item.label,
        evidenceIds: [...item.evidenceIds],
        rationale: item.rationale,
        uncertain: item.uncertain,
        binding: this.binding(current, source),
      };
      const judgment: StoredSupportJudgment = {
        ...content,
        submission: {
          submittedBy: user.id,
          submittedAt: new Date().toISOString(),
          submittedRevision: dto.expectedRevision + 1,
          contentSha256: this.contentHash(content),
        },
        workflow: this.workflow(content),
      };
      let row = rows.find((row) => row.requirementId === item.requirementId);
      if (!row) {
        row = {
          requirementId: item.requirementId,
          status: 'UNREVIEWED',
          note: '',
          evidenceIds: [],
        };
        rows.push(row);
      }
      row.supportJudgment = judgment;
    }
    return this.append(user, id, dto.expectedRevision, current, rows, latest);
  }

  async reviewSupportJudgments(user: AuthUser, id: string, input: ReviewSupportJudgmentsDto) {
    await this.authorize(user, id);
    const dto = this.input(ReviewSupportJudgmentsDto, input);
    const latest = await this.latest(id, dto.expectedRevision);
    if (!latest) throw new ConflictException('Submit support judgments before review');
    const current = this.bound(
      await this.applicationService.getCompanyApplicationHrReview(user, id),
      latest,
    );
    const rows: StoredRequirementReview[] = JSON.parse(JSON.stringify(latest.requirements));
    const judgments = rows.filter((row) => row.supportJudgment);
    if (!judgments.length) throw new ConflictException('No support judgments to review');
    for (const row of judgments) {
      const judgment = row.supportJudgment!;
      if (!this.matches(judgment, current, row.requirementId))
        throw new ConflictException('Support source changed');
      if (judgment.submission.submittedBy === user.id)
        throw new ForbiddenException('A different HR reviewer is required');
      if (
        dto.decision === 'APPROVE' &&
        (judgment.workflow.state !== 'SUBMITTED' ||
          judgment.uncertain ||
          judgment.label === 'INSUFFICIENT_CONTEXT')
      )
        throw new ConflictException('Held judgments require a new submission before approval');
      const checkedAt = new Date().toISOString();
      judgment.workflow = {
        state: dto.decision === 'APPROVE' ? 'REVIEWED' : 'HOLD',
        holdReasons: dto.decision === 'HOLD' ? ['HR_REVIEW_HOLD'] : [],
        checkedAt,
        review: {
          reviewedBy: user.id,
          reviewedAt: checkedAt,
          reviewedRevision: dto.expectedRevision + 1,
          submittedRevision: judgment.submission.submittedRevision,
          submittedContentSha256: judgment.submission.contentSha256,
          decision: dto.decision,
          reason: dto.reason,
        },
      };
    }
    return this.append(user, id, dto.expectedRevision, current, rows, latest);
  }

  async supportExportReadiness(user: AuthUser, id: string, input: SupportExportReadinessDto) {
    await this.authorize(user, id);
    const dto = this.input(SupportExportReadinessDto, input);
    const latest = await this.latest(id, dto.expectedRevision);
    if (!latest) throw new ConflictException('No support workspace');
    let current: CurrentReview | null = null;
    let freshnessUnavailable = false;
    try {
      current = await this.applicationService.getCompanyApplicationHrReview(user, id);
    } catch (error) {
      if ((error as { getStatus?: () => number }).getStatus?.() !== 503) throw error;
      freshnessUnavailable = true;
    }
    const judgments = latest.requirements.filter((row) => row.supportJudgment);
    const stale =
      !current ||
      current.assessmentStatus !== 'PENDING_REVIEW' ||
      current.resultId !== latest.resultId ||
      current.jobSnapshotSha256 !== latest.jobSnapshotSha256 ||
      current.candidateSnapshotSha256 !== latest.candidateSnapshotSha256 ||
      judgments.some((row) => !this.matches(row.supportJudgment!, current!, row.requirementId));
    const reviewed = judgments.filter((row) => {
      const judgment = row.supportJudgment!;
      return (
        judgment.workflow.state === 'REVIEWED' &&
        judgment.workflow.review?.decision === 'APPROVE' &&
        judgment.workflow.review.reviewedRevision === latest.revision &&
        judgment.workflow.review.reviewedBy !== judgment.submission.submittedBy &&
        judgment.workflow.review.submittedRevision === judgment.submission.submittedRevision &&
        judgment.workflow.review.submittedContentSha256 === judgment.submission.contentSha256 &&
        !judgment.uncertain &&
        judgment.label !== 'INSUFFICIENT_CONTEXT'
      );
    }).length;
    return {
      schemaVersion: 'support-export-readiness-v1',
      targetVersion: SUPPORT_TARGET_VERSION,
      workspaceRevision: latest.revision,
      checkedAt: new Date().toISOString(),
      optIn: true,
      exportAllowed: false,
      rows: [],
      isTrainingLabel: false,
      hiringDecision: null,
      bindingScope: 'LATEST_MATCHING_RESULT',
      planStateScope: 'AT_MATCHING_TIME',
      currentPlanRevalidated: false,
      freshness: 'SNAPSHOT_AT_CHECK_TIME',
      freshnessUnavailable,
      stale,
      counts: {
        judgments: judgments.length,
        reviewed,
        reviewExcluded: judgments.length - reviewed,
        sourceExcluded: stale ? judgments.length : 0,
        excluded: judgments.length,
        eligible: 0,
        exported: 0,
      },
      reasons: [
        'CONSENT_AUTHORITY_UNKNOWN',
        'RETENTION_AUTHORITY_UNKNOWN',
        'SOURCE_AVAILABILITY_UNKNOWN',
        ...(!judgments.length ? ['NO_SUPPORT_JUDGMENTS'] : []),
        ...(stale ? ['STALE_OR_UNAVAILABLE_SOURCE'] : []),
        ...(reviewed < judgments.length ? ['UNREVIEWED_OR_HELD_JUDGMENTS'] : []),
      ],
    };
  }
}
