/**
 * Opt-in REAL PostgreSQL repositories/service; SYNTHETIC matching-review dependency.
 * Not JWT/API/model E2E. Root operator creates/removes the disposable database.
 * Required: HR_WORKSPACE_TEST_DB_URL, HR_WORKSPACE_TEST_DB_NAME, HR_WORKSPACE_TEST_DB_ROLE.
 * Name and role must equal nexhire_hr_workspace_it_<16 lowercase hex>; empty DB only.
 * Never reads .env, provisions resources, drops schemas, or connects when not opted in.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthUser, UserRole } from '@nexhire/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'crypto';
import { DataSource, Logger, QueryRunner } from 'typeorm';
import { CreateApplications1784200000000 } from '../../migrations/1784200000000-CreateApplications';
import { AddCompanyLogoDocumentIdToApplications1784600300000 } from '../../migrations/1784600300000-AddCompanyLogoDocumentIdToApplications';
import { AddApplicationMatchSnapshot1784900100000 } from '../../migrations/1784900100000-AddApplicationMatchSnapshot';
import { AddApplicationProgressEvents1786100000000 } from '../../migrations/1786100000000-AddApplicationProgressEvents';
import { AddApplicationAutoMatchRequested1786200100000 } from '../../migrations/1786200100000-AddApplicationAutoMatchRequested';
import { MigrateWithdrawnApplicationsToCancelled1786200200000 } from '../../migrations/1786200200000-MigrateWithdrawnApplicationsToCancelled';
import { CreateApplicationReviews1794441600000 } from '../../migrations/1794441600000-CreateApplicationReviews';
import { Application } from '../entities/application.entity';
import { ApplicationReview } from '../entities/application-review.entity';
import { ApplicationService } from '../application.service';
import {
  SaveReviewWorkspaceDto,
  SubmitSupportJudgmentsDto,
  SUPPORT_TARGET_VERSION,
} from '../dto/review-workspace.dto';
import { ReviewWorkspaceService } from '../review-workspace.service';

const suite = process.env.HR_WORKSPACE_TEST_DB_URL ? describe : describe.skip;

suite('Review workspace real PostgreSQL persistence (synthetic matching snapshot)', () => {
  let source: DataSource;
  let workspace: ReviewWorkspaceService;
  let app: Application;
  const companyId = randomUUID();
  const reviewer: AuthUser = { id: randomUUID(), role: UserRole.RECRUITER, companyId };
  const secondReviewer: AuthUser = { ...reviewer, id: randomUUID() };
  const applicationName = 'hr_workspace_it_' + randomUUID().replace(/-/g, '');
  const queries: string[] = [];
  const sqlErrorCodes: string[] = [];
  // Only this upstream dependency is stubbed: it is explicitly not an M1 output.
  const matching = { getCompanyApplicationHrReview: jest.fn() };
  const synthetic = () => ({
    resultId: randomUUID(),
    assessmentStatus: 'PENDING_REVIEW',
    executionStatus: 'SUCCEEDED',
    scope: 'RETRIEVED_EVIDENCE_ONLY',
    planStateScope: 'AT_MATCHING_TIME',
    currentPlanRevalidated: false,
    planContentSha256: 'c'.repeat(64),
    retrievalModelVersion: 'SYNTHETIC:postgres-fixture-v1',
    verifierModelVersion: null,
    assessmentSource: 'M1_RETRIEVAL',
    jobSnapshotSha256: 'a'.repeat(64),
    candidateSnapshotSha256: 'b'.repeat(64),
    requirements: [
      {
        requirementId: 'synthetic/restore',
        text: 'SYNTHETIC: maintain backups',
        evidence: [
          {
            evidenceId: 'synthetic/project',
            text: 'SYNTHETIC: tested staging restores',
            source: 'project',
          },
        ],
      },
    ],
  });
  let current: ReturnType<typeof synthetic>;
  function input(expectedRevision = 0): SaveReviewWorkspaceDto {
    return {
      expectedRevision,
      resultId: current.resultId,
      jobSnapshotSha256: current.jobSnapshotSha256,
      candidateSnapshotSha256: current.candidateSnapshotSha256,
      requirements: [
        {
          requirementId: 'synthetic/restore',
          status: 'CLARIFY',
          note: 'Ask about restore scope',
          evidenceIds: ['synthetic/project'],
        },
      ],
      questions: [
        {
          id: randomUUID(),
          requirementId: 'synthetic/restore',
          question: 'Describe the restore exercise.',
          answer: '',
          note: '',
        },
      ],
      interviewStatus: 'DRAFT',
    };
  }
  const documents = () =>
    source
      .getRepository(ApplicationReview)
      .find({ where: { applicationId: app.id }, order: { revision: 'ASC' } });
  function support(expectedRevision = 0): SubmitSupportJudgmentsDto {
    return {
      expectedRevision,
      resultId: current.resultId,
      jobSnapshotSha256: current.jobSnapshotSha256,
      candidateSnapshotSha256: current.candidateSnapshotSha256,
      targetVersion: SUPPORT_TARGET_VERSION,
      judgments: [
        {
          requirementId: 'synthetic/restore',
          label: 'SUPPORTED',
          evidenceIds: ['synthetic/project'],
          rationale: 'SYNTHETIC: the cited passage supports the textual requirement.',
          uncertain: false,
        },
      ],
    };
  }
  const logger: Logger = {
    logQuery: (query) => {
      queries.push(query);
    },
    logQueryError: (error) => {
      sqlErrorCodes.push((error as unknown as { code?: string }).code ?? 'unknown');
    },
    logQuerySlow() {},
    logSchemaBuild() {},
    logMigration() {},
    log() {},
  };

  beforeAll(async () => {
    // Independent explicit pins: no discovery, fallback, URL query options, or shared DB.
    let url: URL;
    try {
      url = new URL(process.env.HR_WORKSPACE_TEST_DB_URL!);
    } catch {
      throw new Error('Explicit disposable PostgreSQL URL required');
    }
    const database = process.env.HR_WORKSPACE_TEST_DB_NAME;
    const role = process.env.HR_WORKSPACE_TEST_DB_ROLE;
    if (
      !database ||
      !/^nexhire_hr_workspace_it_[a-f0-9]{16}$/.test(database) ||
      role !== database ||
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' ||
      !/^\d+$/.test(url.port) ||
      Number(url.port) < 1024 ||
      url.port === '5432' ||
      url.pathname !== '/' + database ||
      decodeURIComponent(url.username) !== role ||
      !url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('Only explicitly pinned disposable loopback DB/role/port is allowed');
    }
    source = new DataSource({
      type: 'postgres',
      host: '127.0.0.1',
      port: Number(url.port),
      database,
      username: role,
      password: decodeURIComponent(url.password),
      ssl: false,
      entities: [Application, ApplicationReview],
      synchronize: false,
      migrationsRun: false,
      logging: ['query', 'error'],
      logger,
      connectTimeoutMS: 5000,
      extra: { max: 6, application_name: applicationName, statement_timeout: 10000 },
    });
    let runner: QueryRunner | undefined;
    try {
      await source.initialize();
      const [identity] =
        await source.query(`SELECT current_database() AS database, current_user AS role,
        pg_get_userbyid(d.datdba) AS owner, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication
        FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`);
      if (
        identity.database !== database ||
        identity.role !== role ||
        identity.owner !== role ||
        identity.rolsuper ||
        identity.rolcreatedb ||
        identity.rolcreaterole ||
        identity.rolreplication
      )
        throw new Error('identity');
      const [empty] = await source.query(`SELECT
        (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%') AS relations,
        (SELECT count(*)::int FROM pg_namespace WHERE nspname NOT IN ('public','pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%') AS schemas,
        (SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS types`);
      if (empty.relations !== 0 || empty.schemas !== 0 || empty.types !== 0)
        throw new Error('not empty');
      runner = source.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      const migrations = [
        new CreateApplications1784200000000(),
        new AddCompanyLogoDocumentIdToApplications1784600300000(),
        new AddApplicationMatchSnapshot1784900100000(),
        new AddApplicationProgressEvents1786100000000(),
        new AddApplicationAutoMatchRequested1786200100000(),
        new MigrateWithdrawnApplicationsToCancelled1786200200000(),
        new CreateApplicationReviews1794441600000(),
      ];
      for (const migration of migrations) await migration.up(runner);
      await runner.commitTransaction();
      workspace = new ReviewWorkspaceService(
        source.getRepository(Application),
        source.getRepository(ApplicationReview),
        matching as unknown as ApplicationService,
      );
    } catch {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
      // Do not echo a connection URL, credentials, or driver diagnostics.
      throw new Error(
        'Disposable DB identity/empty-schema/official migration setup failed; operator retains cleanup ownership',
      );
    } finally {
      if (runner) await runner.release();
    }
  }, 30000);

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    current = synthetic();
    matching.getCompanyApplicationHrReview.mockResolvedValue(current);
    app = source.getRepository(Application).create({
      id: randomUUID(),
      jobId: randomUUID(),
      jobTitle: 'SYNTHETIC persistence fixture',
      companyId,
      candidateId: randomUUID(),
      candidateUserId: randomUUID(),
      candidateCvId: randomUUID(),
      cvDocumentId: randomUUID(),
      cvFileName: 'synthetic.pdf',
      cvMimeType: 'application/pdf',
      cvSize: 1,
      cvParseStatus: 'PARSED',
      submittedAt: new Date(),
    });
    await source.getRepository(Application).insert(app);
    queries.length = 0;
    sqlErrorCodes.length = 0;
  });

  it('saves valid DTO and rereads server-derived sources and reviewer from a fresh DB connection', async () => {
    const dto = input();
    expect(await validate(plainToInstance(SaveReviewWorkspaceDto, dto))).toEqual([]);
    const saved = await workspace.save(reviewer, app.id, dto);
    const reader = source.createQueryRunner();
    await reader.connect();
    try {
      const row = await reader.manager
        .getRepository(ApplicationReview)
        .findOneByOrFail({ applicationId: app.id, revision: 1 });
      expect(row.reviewerId).toBe(reviewer.id);
      expect(row.sourceRequirements).toEqual(current.requirements);
      expect(row.requirements).toEqual(dto.requirements);
      expect(row.questions).toEqual(dto.questions);
      expect(row.updatedAt).toBeInstanceOf(Date);
      expect(saved.isTrainingLabel).toBe(false);
      expect(saved.hiringDecision).toBeNull();
    } finally {
      await reader.release();
    }
    expect((await workspace.read(reviewer, app.id)).stale).toBe(false);
  });

  it('appends reviewer revisions and completed answers without overwriting historical source snapshots', async () => {
    await workspace.save(reviewer, app.id, input());
    const original = JSON.stringify((await documents())[0]);
    current.requirements[0].evidence[0].text = 'SYNTHETIC: revised upstream description';
    const dto = input(1);
    dto.interviewStatus = 'COMPLETED';
    dto.questions[0].answer = 'Restored the isolated staging backup.';
    await workspace.save(secondReviewer, app.id, dto);
    const rows = await documents();
    expect(rows.map((row) => row.revision)).toEqual([1, 2]);
    expect(JSON.stringify(rows[0])).toBe(original);
    expect(rows[1].reviewerId).toBe(secondReviewer.id);
    expect(rows[1].sourceRequirements[0].evidence[0].text).toBe(
      current.requirements[0].evidence[0].text,
    );
    expect((await workspace.read(reviewer, app.id)).document?.revision).toBe(2);
  });

  it('rejects stale revisions and changed result/snapshot with 409 and leaves persisted history unchanged', async () => {
    await workspace.save(reviewer, app.id, input());
    const before = JSON.stringify(await documents());
    for (const dto of [
      input(),
      { ...input(1), resultId: randomUUID() },
      { ...input(1), jobSnapshotSha256: 'c'.repeat(64) },
      { ...input(1), candidateSnapshotSha256: 'd'.repeat(64) },
    ]) {
      await expect(workspace.save(reviewer, app.id, dto)).rejects.toBeInstanceOf(ConflictException);
      expect(JSON.stringify(await documents())).toBe(before);
    }
  });

  it('rejects forged evidence/requirements without writing a revision', async () => {
    for (const row of [
      { ...input().requirements[0], evidenceIds: ['foreign-evidence'] },
      { ...input().requirements[0], requirementId: 'foreign-requirement' },
    ]) {
      await expect(
        workspace.save(reviewer, app.id, { ...input(), requirements: [row] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(await documents()).toEqual([]);
  });

  it('denies foreign company and non-recruiter before reading notes or consulting matching', async () => {
    await workspace.save(reviewer, app.id, input());
    const before = JSON.stringify(await documents());
    matching.getCompanyApplicationHrReview.mockClear();
    queries.length = 0;
    for (const user of [
      { ...reviewer, companyId: randomUUID() },
      { ...reviewer, role: UserRole.CANDIDATE },
    ]) {
      const error = user.role === UserRole.CANDIDATE ? ForbiddenException : NotFoundException;
      await expect(workspace.read(user, app.id)).rejects.toBeInstanceOf(error);
      await expect(workspace.save(user, app.id, input(1))).rejects.toBeInstanceOf(error);
    }
    expect(matching.getCompanyApplicationHrReview).not.toHaveBeenCalled();
    expect(queries.some((query) => query.includes('application_reviews'))).toBe(false);
    expect(JSON.stringify(await documents())).toBe(before);
  });

  it('arbitrates two real concurrent inserts: one winner, one 23505 mapped to 409, append-only history', async () => {
    await workspace.save(reviewer, app.id, input());
    const before = JSON.stringify((await documents())[0]);
    const blocker = source.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await blocker.query('LOCK TABLE application_reviews IN SHARE MODE');
      pending = Promise.allSettled([
        workspace.save(reviewer, app.id, input(1)),
        workspace.save(secondReviewer, app.id, input(1)),
      ]);
      const deadline = Date.now() + 5000;
      let blocked = 0;
      while (Date.now() < deadline) {
        const [row] = await source.query(
          `SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE application_name=$1 AND wait_event_type='Lock' AND state='active' AND query LIKE 'INSERT INTO "application_reviews"%'`,
          [applicationName],
        );
        blocked = row.count;
        if (blocked === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(blocked).toBe(2);
    } finally {
      if (blocker.isTransactionActive) await blocker.commitTransaction();
      await blocker.release();
    }
    const outcomes = await pending!;
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const loser = outcomes.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(ConflictException);
    expect(loser.reason.getStatus()).toBe(409);
    expect(sqlErrorCodes).toContain('23505');
    const rows = await documents();
    expect(rows.map((row) => row.revision)).toEqual([1, 2]);
    expect(JSON.stringify(rows[0])).toBe(before);
  }, 15000);

  it('returns stored notes stale with freshnessUnavailable on upstream 503; changed results also stay read-only', async () => {
    await workspace.save(reviewer, app.id, input());
    const before = JSON.stringify(await documents());
    matching.getCompanyApplicationHrReview.mockRejectedValueOnce(new ServiceUnavailableException());
    const unavailable = await workspace.read(reviewer, app.id);
    expect(unavailable.freshnessUnavailable).toBe(true);
    expect(unavailable.stale).toBe(true);
    expect(unavailable.document?.resultId).toBe(current.resultId);
    matching.getCompanyApplicationHrReview.mockResolvedValue({
      ...current,
      resultId: randomUUID(),
    });
    const changed = await workspace.read(reviewer, app.id);
    expect(changed.stale).toBe(true);
    expect(changed.freshnessUnavailable).toBe(false);
    expect(JSON.stringify(await documents())).toBe(before);
  });

  it('persists JSONB support provenance on a fresh connection, second-HR review and approval invalidation with history', async () => {
    await workspace.submitSupportJudgments(reviewer, app.id, support());
    const reader = source.createQueryRunner();
    await reader.connect();
    try {
      const [stored] = await reader.query(
        'SELECT requirements FROM application_reviews WHERE application_id=$1 AND revision=1',
        [app.id],
      );
      expect(stored.requirements[0].supportJudgment).toMatchObject({
        targetVersion: SUPPORT_TARGET_VERSION,
        submission: { submittedBy: reviewer.id, submittedRevision: 1 },
        binding: {
          resultId: current.resultId,
          retrievalModelVersion: current.retrievalModelVersion,
          freshness: 'SNAPSHOT_AT_CHECK_TIME',
        },
        workflow: { state: 'SUBMITTED' },
      });
    } finally {
      await reader.release();
    }
    await expect(
      workspace.reviewSupportJudgments(reviewer, app.id, {
        expectedRevision: 1,
        decision: 'APPROVE',
        reason: 'Self review denied',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await workspace.reviewSupportJudgments(secondReviewer, app.id, {
      expectedRevision: 1,
      decision: 'APPROVE',
      reason: 'SYNTHETIC: independently checked the passage.',
    });
    const before = JSON.stringify(await documents());
    await workspace.save(secondReviewer, app.id, input(2));
    const rows = await documents();
    expect(rows.map((row) => row.revision)).toEqual([1, 2, 3]);
    expect(JSON.stringify(rows.slice(0, 2))).toBe(before);
    expect(rows[2].requirements[0].supportJudgment!.submission).toEqual(
      rows[0].requirements[0].supportJudgment!.submission,
    );
    expect(rows[2].requirements[0].supportJudgment!.workflow).toMatchObject({
      state: 'SUBMITTED',
      approvalResetReason: 'WORKSPACE_REVISION_CHANGED',
    });
    expect(rows[2].requirements[0].supportJudgment!.workflow.review).toBeUndefined();
    expect(rows[1].requirements[0].supportJudgment!.workflow.review).toMatchObject({
      reviewedBy: secondReviewer.id,
      submittedRevision: 1,
      reviewedRevision: 2,
    });
  });

  it('serializes concurrent support review/resubmit with one PK winner, one 23505/409 and immutable history', async () => {
    await workspace.submitSupportJudgments(reviewer, app.id, support());
    const before = JSON.stringify((await documents())[0]);
    const blocker = source.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await blocker.query('LOCK TABLE application_reviews IN SHARE MODE');
      pending = Promise.allSettled([
        workspace.reviewSupportJudgments(secondReviewer, app.id, {
          expectedRevision: 1,
          decision: 'APPROVE',
          reason: 'SYNTHETIC: independent review.',
        }),
        workspace.submitSupportJudgments(reviewer, app.id, support(1)),
      ]);
      const deadline = Date.now() + 5000;
      let blocked = 0;
      while (Date.now() < deadline) {
        const [row] = await source.query(
          `SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE application_name=$1 AND wait_event_type='Lock' AND state='active' AND query LIKE 'INSERT INTO "application_reviews"%'`,
          [applicationName],
        );
        blocked = row.count;
        if (blocked === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(blocked).toBe(2);
    } finally {
      if (blocker.isTransactionActive) await blocker.commitTransaction();
      await blocker.release();
    }
    const outcomes = await pending!;
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const loser = outcomes.find(
      (outcome) => outcome.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(ConflictException);
    expect(sqlErrorCodes).toContain('23505');
    const rows = await documents();
    expect(rows.map((row) => row.revision)).toEqual([1, 2]);
    expect(JSON.stringify(rows[0])).toBe(before);
  }, 15000);

  it('keeps uncertain feedback HOLD and readiness empty, even after approval of a later certain resubmission', async () => {
    const dto = support();
    dto.judgments[0].uncertain = true;
    await workspace.submitSupportJudgments(reviewer, app.id, dto);
    await expect(
      workspace.reviewSupportJudgments(secondReviewer, app.id, {
        expectedRevision: 1,
        decision: 'APPROVE',
        reason: 'Cannot bypass uncertainty',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await documents())[0].requirements[0].supportJudgment!.workflow.state).toBe('HOLD');
    await workspace.submitSupportJudgments(reviewer, app.id, support(1));
    await workspace.reviewSupportJudgments(secondReviewer, app.id, {
      expectedRevision: 2,
      decision: 'APPROVE',
      reason: 'SYNTHETIC: second review after resubmission.',
    });
    const before = JSON.stringify(await documents());
    for (let i = 0; i < 2; i++)
      expect(
        await workspace.supportExportReadiness(reviewer, app.id, {
          expectedRevision: 3,
          optIn: true,
        }),
      ).toMatchObject({
        exportAllowed: false,
        rows: [],
        counts: { judgments: 1, reviewed: 1, excluded: 1, eligible: 0, exported: 0 },
      });
    expect(JSON.stringify(await documents())).toBe(before);
  });
});
