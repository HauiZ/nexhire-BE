import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser, UserRole } from '@nexhire/shared';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Job } from '../entities/job.entity';
import {
  JobRequirementPlan,
  JobRequirementPlanEvent,
} from '../entities/job-requirement-plan.entity';
import { PlanContractClient } from './plan-contract.client';
import {
  CreatePlanDraftDto,
  EditRequirementPlanDto,
  PlanBindingDto,
  PlanDocument,
  PlanInspection,
} from './requirement-plan.dto';

@Injectable()
export class RequirementPlanService {
  constructor(
    private readonly source: DataSource,
    private readonly contract: PlanContractClient,
  ) {}

  private snapshot(job: Job) {
    return {
      id: job.id,
      title: job.title,
      description: job.description ?? '',
      requirements: job.requirements ?? '',
      skills: job.skills ?? [],
      benefits: job.benefits ?? null,
      workingType: job.workingType ?? '',
      experienceLevel: job.experienceLevel ?? '',
      location: job.location ?? '',
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
    };
  }

  private async owned<T>(
    user: AuthUser,
    id: string,
    action: (m: EntityManager, job: Job) => Promise<T>,
  ): Promise<T> {
    if (user.role !== UserRole.RECRUITER || !user.companyId)
      throw new ForbiddenException('Recruiter company required');
    return this.source.transaction(async (manager) => {
      // Serializes plan revisions and binds confirmation to the committed JD snapshot.
      const job = await manager.findOne(Job, {
        where: { id, companyId: user.companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!job) throw new NotFoundException('Company-owned job not found');
      return action(manager, job);
    });
  }

  private latest(manager: EntityManager, job: Job) {
    return manager.findOne(JobRequirementPlan, {
      where: { jobId: job.id, companyId: job.companyId },
      order: { revision: 'DESC' },
    });
  }

  private assertExpected(
    row: JobRequirementPlan | null,
    expected: string,
  ): asserts row is JobRequirementPlan {
    if (!row || row.contentSha256 !== expected)
      throw new ConflictException('Plan changed; reload before editing or confirming');
  }

  async get(user: AuthUser, id: string): Promise<PlanInspection> {
    return this.owned(user, id, async (manager, job) => {
      const row = await this.latest(manager, job);
      return this.contract.call('inspect', {
        job: this.snapshot(job),
        plan: row?.document ?? null,
      });
    });
  }

  async getInternal(id: string): Promise<PlanInspection> {
    // Called only by the service-token guarded controller, never by a public route.
    return this.source.transaction(async (manager) => {
      const job = await manager.findOne(Job, {
        where: { id },
        lock: { mode: 'pessimistic_read' },
      });
      if (!job) throw new NotFoundException('Job not found');
      const row = await this.latest(manager, job);
      return this.contract.call('inspect', {
        job: this.snapshot(job),
        plan: row?.document ?? null,
      });
    });
  }

  async createDraft(user: AuthUser, id: string, dto: CreatePlanDraftDto) {
    return this.owned(user, id, async (manager, job) => {
      const previous = await this.latest(manager, job);
      if ((previous?.revision ?? 0) !== dto.expectedLatestRevision)
        throw new ConflictException('Plan revision changed; reload');
      const result = await this.contract.call('draft', {
        job: this.snapshot(job),
        revision: (previous?.revision ?? 0) + 1,
      });
      await this.saveRevision(manager, job, user, result, 'CREATED');
      return result;
    });
  }

  async edit(user: AuthUser, id: string, dto: EditRequirementPlanDto) {
    return this.owned(user, id, async (manager, job) => {
      const previous = await this.latest(manager, job);
      this.assertExpected(previous, dto.expectedContentSha256);
      const draft = await this.contract.call('draft', {
        job: this.snapshot(job),
        revision: previous.revision + 1,
      });
      const document: PlanDocument = {
        ...draft.plan!,
        requirements: dto.requirements,
        approval: null,
      };
      const result = await this.contract.call('validate', {
        job: this.snapshot(job),
        plan: document,
      });
      await this.saveRevision(manager, job, user, result, 'REVISED');
      return result;
    });
  }

  async confirm(user: AuthUser, id: string, dto: PlanBindingDto) {
    return this.owned(user, id, async (manager, job) => {
      const row = await this.latest(manager, job);
      this.assertExpected(row, dto.expectedContentSha256);
      const inspected = await this.contract.call('inspect', {
        job: this.snapshot(job),
        plan: row.document,
      });
      if (inspected.status === 'STALE')
        throw new ConflictException('JD changed; prepare and review a new revision');
      if (inspected.status === 'HR_CONFIRMED') return inspected;
      if (inspected.status !== 'DRAFT')
        throw new ConflictException('Only an unconfirmed draft can be confirmed');
      const eventId = randomUUID();
      const document: PlanDocument = {
        ...row.document,
        approval: {
          origin: 'authenticated_hr',
          reviewer_id: user.id,
          authorization_event_id: eventId,
          job_id: job.id,
          content_sha256: row.contentSha256,
          approved_at: new Date().toISOString(),
        },
      };
      const result = await this.contract.call('validate', {
        job: this.snapshot(job),
        plan: document,
      });
      if (
        result.status !== 'HR_CONFIRMED' ||
        !result.plan ||
        result.content_sha256 !== row.contentSha256
      ) {
        throw new ConflictException('Confirmation did not bind the expected plan');
      }
      row.document = result.plan;
      await manager.save(JobRequirementPlan, row);
      await this.event(manager, row, user.id, eventId, 'CONFIRMED');
      return result;
    });
  }

  async history(user: AuthUser, id: string) {
    return this.owned(user, id, async (manager, job) => ({
      revisions: await manager.find(JobRequirementPlan, {
        where: { jobId: job.id, companyId: job.companyId },
        order: { revision: 'DESC' },
        take: 50,
      }),
      events: await manager.find(JobRequirementPlanEvent, {
        where: { jobId: job.id },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: 100,
      }),
    }));
  }

  private async saveRevision(
    manager: EntityManager,
    job: Job,
    user: AuthUser,
    result: PlanInspection,
    action: 'CREATED' | 'REVISED',
  ) {
    if (
      !result.plan ||
      !result.content_sha256 ||
      result.status !== 'DRAFT' ||
      result.plan.approval ||
      result.plan.job_id !== job.id
    ) {
      throw new ConflictException('Validator did not return an unconfirmed draft');
    }
    const row = manager.create(JobRequirementPlan, {
      id: randomUUID(),
      jobId: job.id,
      companyId: job.companyId,
      revision: result.plan.revision,
      document: result.plan,
      jobSnapshotSha256: result.plan.job_snapshot_sha256,
      contentSha256: result.content_sha256,
      createdByUserId: user.id,
    });
    await manager.save(JobRequirementPlan, row);
    await this.event(manager, row, user.id, randomUUID(), action);
  }

  private event(
    manager: EntityManager,
    row: JobRequirementPlan,
    actor: string,
    id: string,
    action: 'CREATED' | 'REVISED' | 'CONFIRMED',
  ) {
    return manager.save(
      JobRequirementPlanEvent,
      manager.create(JobRequirementPlanEvent, {
        id,
        jobId: row.jobId,
        planId: row.id,
        actorUserId: actor,
        action,
        contentSha256: row.contentSha256,
      }),
    );
  }
}
