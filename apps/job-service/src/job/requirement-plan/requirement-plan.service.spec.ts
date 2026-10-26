import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, UserRole } from '@nexhire/shared';
import { DataSource } from 'typeorm';
import { Job } from '../entities/job.entity';
import {
  JobRequirementPlan,
  JobRequirementPlanEvent,
} from '../entities/job-requirement-plan.entity';
import { PlanContractClient } from './plan-contract.client';
import { PlanDocument, PlanInspection } from './requirement-plan.dto';
import { RequirementPlanService } from './requirement-plan.service';

const user: AuthUser = { id: 'hr', role: UserRole.RECRUITER, companyId: 'company' };
const hash = 'a'.repeat(64);
const document = (revision = 1): PlanDocument => ({
  schema_version: 'jd-fixed-requirements-v1',
  job_id: 'job',
  job_snapshot_sha256: 'b'.repeat(64),
  revision,
  requirements: [],
  approval: null,
});
const inspection = (plan = document()): PlanInspection => ({
  status: 'DRAFT',
  plan,
  content_sha256: hash,
  current_job_snapshot_sha256: plan.job_snapshot_sha256,
  publishing_blocked: false,
  candidate_support_verified: false,
  matching_mode: 'UNVERIFIED_DRAFT_OR_SOURCE_EVIDENCE',
});

describe('RequirementPlanService', () => {
  let service: RequirementPlanService;
  let manager: { findOne: jest.Mock; find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let contract: { call: jest.Mock };
  let transaction: jest.Mock;
  let job: Job;
  let latest: JobRequirementPlan | null;

  beforeEach(() => {
    job = {
      id: 'job',
      companyId: 'company',
      title: 'Analyst',
      requirements: 'Use SQL.',
      status: 'PUBLISHED',
    } as Job;
    latest = null;
    manager = {
      findOne: jest.fn(async (entity, options) =>
        entity === Job ? (options.where.companyId === job.companyId ? job : null) : latest,
      ),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((_type, value) => value),
      save: jest.fn(async (_type, value) => value),
    };
    transaction = jest.fn(async (callback) => callback(manager));
    contract = { call: jest.fn().mockResolvedValue(inspection()) };
    service = new RequirementPlanService(
      { transaction } as unknown as DataSource,
      contract as unknown as PlanContractClient,
    );
  });

  const setLatest = (plan = document()) =>
    ({
      id: 'plan',
      jobId: 'job',
      companyId: 'company',
      revision: plan.revision,
      contentSha256: hash,
      document: plan,
    }) as JobRequirementPlan;

  it('rejects candidate role or absent company before DB access', async () => {
    await expect(service.get({ ...user, role: UserRole.CANDIDATE }, 'job')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.get({ ...user, companyId: undefined }, 'job')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('conceals jobs belonging to a different company', async () => {
    await expect(service.get({ ...user, companyId: 'other' }, 'job')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(contract.call).not.toHaveBeenCalled();
  });

  it('returns unprepared mode without writes and locks ownership snapshot', async () => {
    contract.call.mockResolvedValue({
      ...inspection(),
      status: 'UNPREPARED',
      plan: null,
      content_sha256: null,
    });
    const result = await service.get(user, 'job');
    expect(result.publishing_blocked).toBe(false);
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.findOne).toHaveBeenCalledWith(
      Job,
      expect.objectContaining({
        where: { id: 'job', companyId: 'company' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
  });

  it('creates an optional draft and audit atomically without changing published status', async () => {
    await service.createDraft(user, 'job', { expectedLatestRevision: 0 });
    expect(manager.save).toHaveBeenCalledWith(
      JobRequirementPlan,
      expect.objectContaining({ revision: 1, createdByUserId: 'hr' }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      JobRequirementPlanEvent,
      expect.objectContaining({ action: 'CREATED', actorUserId: 'hr' }),
    );
    expect(job.status).toBe('PUBLISHED');
    expect(manager.save.mock.calls.some(([entity]) => entity === Job)).toBe(false);
  });

  it('blocks stale draft creation and stale content before validation', async () => {
    latest = setLatest();
    await expect(
      service.createDraft(user, 'job', { expectedLatestRevision: 0 }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.confirm(user, 'job', { expectedContentSha256: '0'.repeat(64) }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(contract.call).not.toHaveBeenCalled();
  });

  it('does not confirm a changed JD snapshot', async () => {
    latest = setLatest();
    contract.call.mockResolvedValue({ ...inspection(), status: 'STALE' });
    await expect(
      service.confirm(user, 'job', { expectedContentSha256: hash }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('creates approval identity and event server-side only', async () => {
    latest = setLatest();
    contract.call.mockImplementation(async (operation, body) =>
      operation === 'inspect' ? inspection() : { ...inspection(body.plan), status: 'HR_CONFIRMED' },
    );
    const result = await service.confirm(user, 'job', { expectedContentSha256: hash });
    expect(result.plan!.approval!.reviewer_id).toBe('hr');
    const approval = result.plan!.approval!;
    expect(manager.save).toHaveBeenCalledWith(
      JobRequirementPlanEvent,
      expect.objectContaining({
        id: approval.authorization_event_id,
        actorUserId: 'hr',
        action: 'CONFIRMED',
      }),
    );
    expect(result.candidate_support_verified).toBe(false);
  });

  it('is idempotent on repeated current confirmation', async () => {
    latest = setLatest();
    contract.call.mockResolvedValue({ ...inspection(), status: 'HR_CONFIRMED' });
    await service.confirm(user, 'job', { expectedContentSha256: hash });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('saves edits as a new unconfirmed revision preserving old record', async () => {
    latest = setLatest({
      ...document(),
      approval: {
        origin: 'authenticated_hr',
        reviewer_id: 'old',
        authorization_event_id: 'old-event',
        job_id: 'job',
        content_sha256: hash,
        approved_at: '2026-10-24T00:00:00Z',
      },
    });
    contract.call.mockImplementation(async (operation, body) =>
      operation === 'draft' ? inspection(document(2)) : inspection(body.plan),
    );
    await service.edit(user, 'job', { expectedContentSha256: hash, requirements: [] });
    expect(manager.save).toHaveBeenCalledWith(
      JobRequirementPlan,
      expect.objectContaining({
        revision: 2,
        document: expect.objectContaining({ approval: null }),
      }),
    );
    expect(latest.document.approval!.reviewer_id).toBe('old');
  });

  it('does not save anything when validator fails', async () => {
    contract.call.mockRejectedValue(new Error('validator offline'));
    await expect(service.createDraft(user, 'job', { expectedLatestRevision: 0 })).rejects.toThrow(
      'validator offline',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('bounds revision and event history', async () => {
    await service.history(user, 'job');
    expect(manager.find).toHaveBeenCalledWith(
      JobRequirementPlan,
      expect.objectContaining({ take: 50 }),
    );
    expect(manager.find).toHaveBeenCalledWith(
      JobRequirementPlanEvent,
      expect.objectContaining({ take: 100 }),
    );
  });

  it('keeps service reads read-only and binds them to a locked current job snapshot', async () => {
    manager.findOne.mockResolvedValueOnce(job).mockResolvedValueOnce(null);
    await service.getInternal(job.id);
    expect(manager.findOne).toHaveBeenCalledWith(
      Job,
      expect.objectContaining({
        where: { id: job.id },
        lock: { mode: 'pessimistic_read' },
      }),
    );
    expect(contract.call).toHaveBeenCalledWith('inspect', expect.objectContaining({ plan: null }));
    expect(manager.save).not.toHaveBeenCalled();
  });
});
