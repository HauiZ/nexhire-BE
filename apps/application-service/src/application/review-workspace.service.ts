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
import { Application } from './entities/application.entity';
import { ApplicationReview } from './entities/application-review.entity';
import { ApplicationService } from './application.service';
import { SaveReviewWorkspaceDto } from './dto/review-workspace.dto';

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
        current.candidateSnapshotSha256 !== document.candidateSnapshotSha256);
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
    const { expectedRevision, ...content } = dto;
    const latest = await this.reviews.findOne({
      where: { applicationId: id },
      order: { revision: 'DESC' },
    });
    if ((latest?.revision ?? 0) !== expectedRevision)
      throw new ConflictException('Another reviewer saved changes. Reload before saving.');
    const values = {
      ...content,
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
}
