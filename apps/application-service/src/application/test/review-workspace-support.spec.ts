/** Component/unit contract tests. Internal gateway headers are used, NOT real-JWT E2E. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { InternalAuthGuard, RolesGuard, UserRole, setupApp } from '@nexhire/shared';
import request from 'supertest';
import { ApplicationService } from '../application.service';
import { ApplicationReview } from '../entities/application-review.entity';
import { ReviewWorkspaceService } from '../review-workspace.service';
import { RecruiterApplicationController } from '../recruiter-application.controller';
import {
  SubmitSupportJudgmentsDto,
  SaveReviewWorkspaceDto,
  SUPPORT_TARGET_VERSION,
} from '../dto/review-workspace.dto';

const appId = '21000000-0000-4000-8000-000000000001';
const user = {
  id: '21000000-0000-4000-8000-000000000002',
  role: UserRole.RECRUITER,
  companyId: '21000000-0000-4000-8000-000000000003',
};
const second = { ...user, id: '21000000-0000-4000-8000-000000000004' };
const synthetic = () => ({
  resultId: '21000000-0000-4000-8000-000000000005',
  assessmentStatus: 'PENDING_REVIEW',
  executionStatus: 'SUCCEEDED',
  scope: 'RETRIEVED_EVIDENCE_ONLY',
  planStateScope: 'AT_MATCHING_TIME',
  currentPlanRevalidated: false,
  planContentSha256: 'c'.repeat(64),
  retrievalModelVersion: 'SYNTHETIC:model-v1',
  verifierModelVersion: null,
  assessmentSource: 'M1_RETRIEVAL',
  jobSnapshotSha256: 'a'.repeat(64),
  candidateSnapshotSha256: 'b'.repeat(64),
  requirements: [
    {
      requirementId: 'r1',
      text: 'SYNTHETIC: maintain backups',
      evidence: [
        { evidenceId: 'e1', source: 'project', text: 'SYNTHETIC: tested staging restores' },
      ],
    },
    {
      requirementId: 'r2',
      text: 'SYNTHETIC: monitor services',
      evidence: [{ evidenceId: 'e2', source: 'project', text: 'SYNTHETIC: recorded alerts' }],
    },
  ],
});

describe('Source-bound support feedback (synthetic upstream, append-only repository fixture)', () => {
  let current: ReturnType<typeof synthetic>;
  let history: ApplicationReview[];
  const applications = { findOne: jest.fn() };
  const reviews = { findOne: jest.fn(), insert: jest.fn() };
  const upstream = { getCompanyApplicationHrReview: jest.fn() };
  const service = new ReviewWorkspaceService(
    applications as never,
    reviews as never,
    upstream as never,
  );
  let http: INestApplication;
  const submission = (revision = history.length): SubmitSupportJudgmentsDto => ({
    expectedRevision: revision,
    resultId: current.resultId,
    jobSnapshotSha256: current.jobSnapshotSha256,
    candidateSnapshotSha256: current.candidateSnapshotSha256,
    targetVersion: SUPPORT_TARGET_VERSION,
    judgments: [
      {
        requirementId: 'r1',
        label: 'SUPPORTED',
        evidenceIds: ['e1'],
        rationale: 'SYNTHETIC: the passage supports this textual requirement.',
        uncertain: false,
      },
    ],
  });
  const notes = (revision = history.length): SaveReviewWorkspaceDto => ({
    expectedRevision: revision,
    resultId: current.resultId,
    jobSnapshotSha256: current.jobSnapshotSha256,
    candidateSnapshotSha256: current.candidateSnapshotSha256,
    requirements: [
      {
        requirementId: 'r1',
        status: 'CLARIFY',
        note: 'Private note remains distinct.',
        evidenceIds: ['e1'],
      },
    ],
    questions: [],
    interviewStatus: 'DRAFT',
  });
  const submit = () => service.submitSupportJudgments(user, appId, submission());
  const judgment = () => history[history.length - 1].requirements[0].supportJudgment!;
  const review = (decision: 'APPROVE' | 'HOLD' = 'APPROVE') =>
    service.reviewSupportJudgments(second, appId, {
      expectedRevision: history.length,
      decision,
      reason: 'SYNTHETIC: independent textual-evidence check.',
    });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RecruiterApplicationController],
      providers: [
        { provide: ApplicationService, useValue: upstream },
        { provide: ReviewWorkspaceService, useValue: service },
        { provide: APP_GUARD, useClass: InternalAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    http = module.createNestApplication();
    setupApp(http, { serviceName: 'support-component-test', swagger: false });
    await http.init();
  });
  afterAll(async () => {
    await http.close();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    history = [];
    current = synthetic();
    applications.findOne.mockImplementation(async ({ where }) =>
      where.companyId === user.companyId ? { id: appId } : null,
    );
    upstream.getCompanyApplicationHrReview.mockImplementation(async () => current);
    reviews.findOne.mockImplementation(async () => history[history.length - 1] ?? null);
    reviews.insert.mockImplementation(async (value) => {
      if (history.some((row) => row.revision === value.revision)) throw { code: '23505' };
      history.push(JSON.parse(JSON.stringify(value)));
      return {};
    });
  });

  it('stores server provenance and immutable content revision independently of note statuses', async () => {
    await service.save(user, appId, notes());
    await submit();
    const row = judgment();
    expect(history[1].requirements[0].status).toBe('CLARIFY');
    expect(row.submission).toMatchObject({ submittedBy: user.id, submittedRevision: 2 });
    expect(row.submission.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(row.binding).toMatchObject({
      resultId: current.resultId,
      planContentSha256: current.planContentSha256,
      retrievalModelVersion: current.retrievalModelVersion,
      currentPlanRevalidated: false,
      freshness: 'SNAPSHOT_AT_CHECK_TIME',
    });
    expect(row.workflow.state).toBe('SUBMITTED');
    expect((await service.read(user, appId)).isTrainingLabel).toBe(false);
  });

  it('keeps feedback digests valid after JSONB-style recursive key reorder without weakening value binding', async () => {
    const reorder = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reorder);
      if (value !== null && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([key, item]) => [key, reorder(item)]),
        );
      return value;
    };
    current.requirements[0].evidence.push({
      evidenceId: 'e3',
      source: 'project',
      text: 'SYNTHETIC: a second restore exercise',
    });
    const dto = submission();
    dto.judgments[0].evidenceIds.push('e3');
    await service.submitSupportJudgments(user, appId, dto);
    const original = JSON.parse(JSON.stringify(judgment()));
    history = reorder(history) as ApplicationReview[];
    expect(judgment().submission.contentSha256).toBe(original.submission.contentSha256);
    expect(judgment().evidenceIds).toEqual(original.evidenceIds);
    await expect(
      service.reviewSupportJudgments(user, appId, {
        expectedRevision: 1,
        decision: 'APPROVE',
        reason: 'Self review remains forbidden',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((await service.read(user, appId)).stale).toBe(false);
    await review();
    history = reorder(history) as ApplicationReview[];
    const manifest = await service.supportExportReadiness(second, appId, {
      expectedRevision: 2,
      optIn: true,
    });
    expect(manifest).toMatchObject({
      stale: false,
      exportAllowed: false,
      rows: [],
      counts: { reviewed: 1, excluded: 1 },
    });
    await service.save(second, appId, notes());
    expect(judgment().submission).toEqual(original.submission);
    expect(judgment().workflow.state).toBe('SUBMITTED');
    const originalText = current.requirements[0].evidence[0].text;
    current.requirements[0].evidence[0].text += ' changed value';
    expect((await service.read(user, appId)).stale).toBe(true);
    await expect(review()).rejects.toBeInstanceOf(ConflictException);
    current.requirements[0].evidence[0].text = originalText;
    judgment().evidenceIds.reverse();
    expect((await service.read(user, appId)).stale).toBe(true);
    await expect(review()).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires a different immutable submitter even after another HR saved ordinary notes', async () => {
    await submit();
    await service.save(second, appId, notes());
    expect(history[1].reviewerId).toBe(second.id);
    await expect(
      service.reviewSupportJudgments(user, appId, {
        expectedRevision: 2,
        decision: 'APPROVE',
        reason: 'Self approval',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await review();
    expect(judgment().workflow.review).toMatchObject({
      reviewedBy: second.id,
      reviewedRevision: 3,
      submittedRevision: 1,
      submittedContentSha256: history[0].requirements[0].supportJudgment!.submission.contentSha256,
    });
  });

  it('invalidates approval on any notes revision, preserves original submission and historical approval', async () => {
    await submit();
    await review();
    const before = JSON.stringify(history[1]);
    const provenance = judgment().submission;
    await service.save(second, appId, notes());
    expect(judgment().submission).toEqual(provenance);
    expect(judgment().workflow).toMatchObject({
      state: 'SUBMITTED',
      approvalResetReason: 'WORKSPACE_REVISION_CHANGED',
    });
    expect(judgment().workflow.review).toBeUndefined();
    expect(JSON.stringify(history[1])).toBe(before);
    await submit();
    expect(judgment().submission.submittedRevision).toBe(4);
    expect(judgment().workflow.review).toBeUndefined();
  });

  it.each(['result', 'snapshot', 'plan', 'model', 'requirement', 'evidence', 'removed'])(
    'drops judgments after changed %s binding on ordinary notes save',
    async (kind) => {
      await submit();
      if (kind === 'result') current.resultId = '21000000-0000-4000-8000-000000000099';
      if (kind === 'snapshot') current.candidateSnapshotSha256 = 'd'.repeat(64);
      if (kind === 'plan') current.planContentSha256 = 'd'.repeat(64);
      if (kind === 'model') current.retrievalModelVersion = 'SYNTHETIC:model-v2';
      if (kind === 'requirement') current.requirements[0].text += ' changed';
      if (kind === 'evidence') current.requirements[0].evidence[0].text += ' changed';
      const dto = notes();
      if (kind === 'removed') {
        current.requirements.shift();
        dto.requirements = [];
      }
      expect((await service.read(user, appId)).stale).toBe(true);
      await service.save(user, appId, dto);
      expect(history[1].requirements.every((row) => !row.supportJudgment)).toBe(true);
      expect(history[0].requirements[0].supportJudgment).toBeDefined();
    },
  );

  it.each([
    { label: 'SUPPORTED', uncertain: true },
    { label: 'INSUFFICIENT_CONTEXT', uncertain: false },
  ])('holds uncertain/insufficient inputs without an approval escape', async (item) => {
    const dto = submission();
    Object.assign(dto.judgments[0], item);
    await service.submitSupportJudgments(user, appId, dto);
    expect(judgment().workflow.state).toBe('HOLD');
    await expect(review()).rejects.toBeInstanceOf(ConflictException);
    await service.save(second, appId, notes());
    await expect(review()).rejects.toBeInstanceOf(ConflictException);
    await submit();
    await review();
    expect(judgment().workflow.state).toBe('REVIEWED');
  });

  it('keeps a manual HOLD across notes revisions; a deliberate new submission is required', async () => {
    await submit();
    await review('HOLD');
    await service.save(user, appId, notes());
    await expect(review()).rejects.toBeInstanceOf(ConflictException);
    expect(judgment().workflow.state).toBe('HOLD');
    await submit();
    await review();
    expect(judgment().workflow.state).toBe('REVIEWED');
  });

  it('denies empty, duplicate, foreign-evidence, unknown requirement and forged server metadata without writes', async () => {
    const invalidEdits: Array<(dto: SubmitSupportJudgmentsDto) => void> = [
      (d) => {
        d.judgments = [];
      },
      (d) => d.judgments.push(d.judgments[0]),
      (d) => {
        d.judgments[0].evidenceIds = [];
      },
      (d) => {
        d.judgments[0].evidenceIds = ['e2'];
      },
      (d) => {
        d.judgments[0].evidenceIds = ['e1', 'e1'];
      },
      (d) => {
        d.judgments[0].requirementId = 'foreign';
      },
      (d) => {
        d.judgments[0].rationale = '   ';
      },
      (d) => {
        Object.assign(d.judgments[0], { submission: { submittedBy: second.id } });
      },
      (d) => {
        Object.assign(d.judgments[0], { binding: {} });
      },
      (d) => {
        Object.assign(d, { reviewerId: second.id });
      },
    ];
    for (const modify of invalidEdits) {
      const dto = submission();
      modify(dto);
      await expect(service.submitSupportJudgments(user, appId, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    const forged = notes();
    Object.assign(forged.requirements[0], { supportJudgment: { label: 'SUPPORTED' } });
    await expect(service.save(user, appId, forged)).rejects.toBeInstanceOf(BadRequestException);
    expect(reviews.insert).not.toHaveBeenCalled();
  });

  it('rejects stale sources/revisions and maps a concurrent PK collision to 409', async () => {
    await submit();
    const before = JSON.stringify(history);
    await expect(service.submitSupportJudgments(user, appId, submission(0))).rejects.toBeInstanceOf(
      ConflictException,
    );
    current.planContentSha256 = 'd'.repeat(64);
    await expect(review()).rejects.toBeInstanceOf(ConflictException);
    expect(JSON.stringify(history)).toBe(before);
    current = synthetic();
    reviews.insert.mockRejectedValueOnce({ code: '23505' });
    await expect(review()).rejects.toBeInstanceOf(ConflictException);
    expect(JSON.stringify(history)).toBe(before);
  });

  it('always denies export, including approved/opted-in repeated reads; exposes no private payload', async () => {
    await submit();
    await review();
    for (let i = 0; i < 2; i++) {
      const manifest = await service.supportExportReadiness(second, appId, {
        expectedRevision: 2,
        optIn: true,
      });
      expect(manifest).toMatchObject({
        exportAllowed: false,
        rows: [],
        stale: false,
        counts: { judgments: 1, reviewed: 1, excluded: 1, eligible: 0, exported: 0 },
      });
      expect(manifest.reasons).toEqual([
        'CONSENT_AUTHORITY_UNKNOWN',
        'RETENTION_AUTHORITY_UNKNOWN',
        'SOURCE_AVAILABILITY_UNKNOWN',
      ]);
      const text = JSON.stringify(manifest);
      for (const secret of [
        appId,
        user.id,
        second.id,
        current.resultId,
        'staging restores',
        'textual requirement.',
        'independent textual',
      ])
        expect(text).not.toContain(secret);
    }
    expect(history).toHaveLength(2);
  });

  it('marks stale/unavailable judgments excluded while keeping export disabled', async () => {
    await submit();
    await review();
    current.requirements[0].text += ' changed';
    expect((await service.read(user, appId)).stale).toBe(true);
    expect(
      await service.supportExportReadiness(user, appId, { expectedRevision: 2, optIn: true }),
    ).toMatchObject({ stale: true, exportAllowed: false, counts: { excluded: 1 } });
    upstream.getCompanyApplicationHrReview.mockRejectedValueOnce(new ServiceUnavailableException());
    expect(
      await service.supportExportReadiness(user, appId, { expectedRevision: 2, optIn: true }),
    ).toMatchObject({ stale: true, freshnessUnavailable: true, rows: [] });
    await expect(
      service.supportExportReadiness(user, appId, { expectedRevision: 1, optIn: true }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('checks role/company before any support read or write', async () => {
    for (const other of [
      { ...user, role: UserRole.CANDIDATE },
      { ...user, companyId: second.id },
    ]) {
      for (const run of [
        () => service.submitSupportJudgments(other, appId, submission()),
        () =>
          service.reviewSupportJudgments(other, appId, {
            expectedRevision: 1,
            decision: 'HOLD',
            reason: 'Hold',
          }),
        () => service.supportExportReadiness(other, appId, { expectedRevision: 1, optIn: true }),
      ])
        await expect(run()).rejects.toBeInstanceOf(
          other.role === UserRole.CANDIDATE ? ForbiddenException : NotFoundException,
        );
    }
    expect(reviews.findOne).not.toHaveBeenCalled();
    expect(upstream.getCompanyApplicationHrReview).not.toHaveBeenCalled();
    expect(reviews.insert).not.toHaveBeenCalled();
  });

  it.each(['resultId', 'jobSnapshotSha256', 'candidateSnapshotSha256'] as const)(
    'marks notes-only readiness stale after changed %s without writing',
    async (field) => {
      await service.save(user, appId, notes());
      const before = JSON.stringify(history);
      current[field] = field === 'resultId' ? second.id : 'd'.repeat(64);
      const manifest = await service.supportExportReadiness(user, appId, {
        expectedRevision: 1,
        optIn: true,
      });
      expect(manifest).toMatchObject({
        stale: true,
        exportAllowed: false,
        rows: [],
        counts: { judgments: 0, excluded: 0, eligible: 0, exported: 0 },
      });
      expect(manifest.reasons).toContain('STALE_OR_UNAVAILABLE_SOURCE');
      expect(JSON.stringify(history)).toBe(before);
      expect(reviews.insert).toHaveBeenCalledTimes(1);
    },
  );

  const post = (suffix: string, body: object, identity: typeof user = user) =>
    request(http.getHttpServer())
      .post(`/api/v1/recruiter/applications/${appId}/review-workspace${suffix}`)
      .set('x-user-id', identity.id)
      .set('x-user-role', identity.role)
      .set('x-company-id', identity.companyId)
      .send(body);

  it('uses real controller/guards/ValidationPipe: missing identity401, candidate403, foreign404; valid input200', async () => {
    await request(http.getHttpServer())
      .post(`/api/v1/recruiter/applications/${appId}/review-workspace/support-judgments`)
      .send(submission())
      .expect(401);
    await post('/support-judgments', submission(), { ...user, role: UserRole.CANDIDATE }).expect(
      403,
    );
    await post('/support-judgments', submission(), { ...user, companyId: second.id }).expect(404);
    await post('/support-judgments', submission()).expect(200);
    await post(
      '/support-review',
      { expectedRevision: 1, decision: 'APPROVE', reason: 'Independent check' },
      second,
    ).expect(200);
    const response = await post('/support-export-readiness', {
      expectedRevision: 2,
      optIn: true,
    }).expect(200);
    expect(response.body.data).toMatchObject({ exportAllowed: false, rows: [] });
  });

  it('rejects string/number/null booleans, nested spoofing and whitespace through production implicit-conversion pipe', async () => {
    for (const value of ['false', 'true', 0, 1, null]) {
      const dto = submission();
      Object.assign(dto.judgments[0], { uncertain: value });
      await post('/support-judgments', dto).expect(400);
      await post('/support-export-readiness', { expectedRevision: 1, optIn: value }).expect(400);
    }
    for (const field of ['binding', 'submission', 'workflow', 'reviewerId']) {
      const dto = submission();
      Object.assign(dto.judgments[0], { [field]: {} });
      await post('/support-judgments', dto).expect(400);
    }
    const dto = notes();
    Object.assign(dto.requirements[0], { supportJudgment: {} });
    await post('', dto).expect(400);
    await post('/support-review', {
      expectedRevision: 1,
      decision: 'APPROVE',
      reason: '   ',
    }).expect(400);
    expect(reviews.insert).not.toHaveBeenCalled();
  });
});
