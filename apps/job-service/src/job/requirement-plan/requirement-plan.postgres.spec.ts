/** Opt-in local-only PostgreSQL + real Node/Python HTTP integration; no deploy DB access. */
import { INestApplication } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AuthUser, InternalAuthGuard, RolesGuard, UserRole, setupApp } from '@nexhire/shared';
import { ChildProcess, spawn, spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { parse } from 'dotenv';
import { readFileSync } from 'fs';
import path from 'path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Job } from '../entities/job.entity';
import { JobService } from '../job.service';
import { JobInternalController } from '../controllers/job.controller';
import { CompanyStatusSnapshot, CompanyTrustLevel } from '../entities/job.enum';
import {
  JobRequirementPlan,
  JobRequirementPlanEvent,
} from '../entities/job-requirement-plan.entity';
import { CreateJobRequirementPlans1792800000000 } from '../../migrations/1792800000000-CreateJobRequirementPlans';
import {
  InternalRequirementPlanController,
  RequirementPlanController,
} from './requirement-plan.controller';
import { PlanContractClient } from './plan-contract.client';
import { RequirementPlanService } from './requirement-plan.service';
import { PlanInspection } from './requirement-plan.dto';

const suite = process.env.RUN_JD_PLAN_POSTGRES_TEST === '1' ? describe : describe.skip;
const python = path.resolve(
  'apps/matching-service/.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);

suite('Local-only JD plan PostgreSQL and trusted read integration', () => {
  let app: INestApplication;
  let source: DataSource;
  let validator: ChildProcess;
  let validatorClosed: Promise<void>;
  let settings: Record<string, string>;
  let database: string;
  let created = false;
  let appUrl: string;
  let service: RequirementPlanService;
  const company = randomUUID();
  const hr: AuthUser = { id: randomUUID(), role: UserRole.RECRUITER, companyId: company };

  function admin(sql: string) {
    if (!/^nexhire_plan_it_[a-f0-9]{16}$/.test(database))
      throw new Error('Unsafe test database name');
    const result = spawnSync(
      'docker',
      [
        'exec',
        '-i',
        'nexhire-postgres',
        'sh',
        '-c',
        'exec psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1',
      ],
      { input: sql, encoding: 'utf8', windowsHide: true, timeout: 15000 },
    );
    if (result.status !== 0)
      throw new Error('Local test database administration failed; existing DBs unchanged');
  }

  function identity(user = hr) {
    return { 'x-user-id': user.id, 'x-user-role': user.role, 'x-company-id': user.companyId! };
  }
  function route(job: Job) {
    return `/api/v1/recruiter/jobs/${job.id}/requirement-plan`;
  }

  async function fixture() {
    return source.getRepository(Job).save(
      source.getRepository(Job).create({
        id: randomUUID(),
        companyId: company,
        title: 'Local fictional analyst',
        companyStatus: CompanyStatusSnapshot.APPROVED,
        companyTrustLevel: CompanyTrustLevel.MEDIUM,
        companySnapshotAt: new Date(),
        createdByUserId: hr.id,
        requirements: 'Use SQL and deploy on AWS.',
        skills: [],
        description: '',
        status: 'PUBLISHED' as Job['status'],
      }),
    );
  }

  function snapshot(job: Job) {
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

  async function matchingRead(job: Job) {
    const code = [
      'import asyncio, json, os, sys',
      'from types import SimpleNamespace',
      'from app.clients.internal import InternalClient',
      'from app.schemas.snapshots import JobMatchingSnapshot',
      'value = json.load(sys.stdin)',
      'client = InternalClient.__new__(InternalClient)',
      "client.settings = SimpleNamespace(job_service_url=value['url'], http_timeout_seconds=5, internal_service_token=os.environ['PLAN_TEST_TOKEN'])",
      "context = asyncio.run(client.get_job_requirement_plan(JobMatchingSnapshot.model_validate(value['job'])))",
      "print(json.dumps({'status':context.status, 'confirmed':context.confirmed_plan is not None, 'reason':context.reason, 'candidate_support_verified':context.candidate_support_verified}))",
    ].join('\n');
    return new Promise<{
      status: string;
      confirmed: boolean;
      reason: string;
      candidate_support_verified: boolean;
    }>((resolve, reject) => {
      const child = spawn(python, ['-B', '-c', code], {
        cwd: path.resolve('apps/matching-service'),
        windowsHide: true,
        env: { ...process.env, PLAN_TEST_TOKEN: settings.INTERNAL_SERVICE_TOKEN },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let output = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Matching read probe timeout'));
      }, 15000);
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
      });
      child.once('error', () => {
        clearTimeout(timer);
        reject(new Error('Matching read probe could not start'));
      });
      child.once('close', (status) => {
        clearTimeout(timer);
        if (status !== 0)
          return reject(new Error('Matching read probe failed (credentials not logged)'));
        try {
          resolve(JSON.parse(output));
        } catch {
          reject(new Error('Invalid matching probe output'));
        }
      });
      child.stdin.end(JSON.stringify({ url: appUrl, job: snapshot(job) }));
    });
  }

  beforeAll(async () => {
    // Explicit file only: never inherit a deploy database URL or execute the normal migration CLI.
    settings = parse(readFileSync(path.resolve('.env.local')));
    if (
      !['localhost', '127.0.0.1', '::1'].includes(settings.DB_HOST) ||
      !/^[0-9]+$/.test(settings.DB_PORT) ||
      !settings.JOB_SERVICE_DB_USER ||
      !settings.JOB_SERVICE_DB_PASS ||
      !settings.INTERNAL_SERVICE_TOKEN
    ) {
      throw new Error('Only complete loopback .env.local credentials are allowed');
    }
    const port = spawnSync('docker', ['port', 'nexhire-postgres', '5432/tcp'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (
      port.status !== 0 ||
      !port.stdout.split(/\r?\n/).some((line) => line.endsWith(':' + settings.DB_PORT))
    ) {
      throw new Error('Local DB port does not match the inspected Docker PostgreSQL container');
    }
    database = 'nexhire_plan_it_' + randomUUID().replace(/-/g, '').slice(0, 16);
    const owner = settings.JOB_SERVICE_DB_USER.replace(/"/g, '""');
    admin(`CREATE DATABASE "${database}" OWNER "${owner}";`);
    created = true;
    const options = {
      type: 'postgres' as const,
      host: settings.DB_HOST,
      port: Number(settings.DB_PORT),
      username: settings.JOB_SERVICE_DB_USER,
      password: settings.JOB_SERVICE_DB_PASS,
      database,
      ssl: false as const,
      logging: false as const,
      extra: { max: 8 },
    };
    const baseline = new DataSource({ ...options, entities: [Job], synchronize: false });
    try {
      await baseline.initialize();
      // Fresh throwaway DB only: bootstrap the pre-existing jobs table from its entity.
      await baseline.synchronize();
    } finally {
      if (baseline.isInitialized) await baseline.destroy();
    }
    source = new DataSource({
      ...options,
      entities: [Job, JobRequirementPlan, JobRequirementPlanEvent],
      synchronize: false,
      migrations: [CreateJobRequirementPlans1792800000000],
      migrationsTableName: 'plan_test_migrations',
    });
    await source.initialize();
    const applied = await source.runMigrations();
    expect(applied.map((m) => m.name)).toEqual(['CreateJobRequirementPlans1792800000000']);
    expect(await source.runMigrations()).toHaveLength(0);

    const code = [
      'import os, socket, uvicorn',
      'from types import SimpleNamespace',
      'from fastapi import FastAPI',
      'import app.api.jd_plans as plans',
      "plans.get_settings=lambda: SimpleNamespace(internal_service_token=os.environ['PLAN_TEST_TOKEN'])",
      'sock=socket.socket()',
      "sock.bind(('127.0.0.1',0))",
      'sock.listen(128)',
      'async def ready():',
      "    print('READY:'+str(sock.getsockname()[1]), flush=True)",
      'app=FastAPI(on_startup=[ready])',
      "app.include_router(plans.router,prefix='/api/v1')",
      "uvicorn.Server(uvicorn.Config(app,log_level='error')).run(sockets=[sock])",
    ].join('\n');
    validator = spawn(python, ['-B', '-c', code], {
      cwd: path.resolve('apps/matching-service'),
      env: { ...process.env, PLAN_TEST_TOKEN: settings.INTERNAL_SERVICE_TOKEN },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    validatorClosed = new Promise((resolve) => validator.once('close', () => resolve()));
    const validatorPort = await new Promise<number>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => {
        validator.kill();
        reject(new Error('Validator startup timeout'));
      }, 15000);
      validator.stdout!.on('data', (chunk) => {
        output += chunk.toString();
        const match = output.match(/READY:(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
      validator.once('error', () => {
        clearTimeout(timer);
        reject(new Error('Validator startup failed'));
      });
      validator.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Validator exited during startup'));
      });
    });
    const values: Record<string, string | number> = {
      INTERNAL_SERVICE_TOKEN: settings.INTERNAL_SERVICE_TOKEN,
      'jobService.internalServiceToken': settings.INTERNAL_SERVICE_TOKEN,
      'jobService.services.matchingService': `http://127.0.0.1:${validatorPort}`,
      'jobService.http.timeoutMs': 5000,
    };
    const config = {
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    } as ConfigService;
    service = new RequirementPlanService(source, new PlanContractClient(new HttpService(), config));
    const module = await Test.createTestingModule({
      controllers: [RequirementPlanController, InternalRequirementPlanController, JobInternalController],
      providers: [
        { provide: RequirementPlanService, useValue: service },
        // Uses the real snapshot method and repository; unrelated job workflows are not booted.
        { provide: JobService, useValue: Object.assign(Object.create(JobService.prototype), { jobRepo: source.getRepository(Job) }) },
        { provide: ConfigService, useValue: config },
        { provide: APP_GUARD, useClass: InternalAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    setupApp(app, { serviceName: 'local-postgres-plan-test', swagger: false });
    await app.listen(0, '127.0.0.1');
    appUrl = await app.getUrl();
  }, 60000);

  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      if (validator && validator.exitCode === null) validator.kill();
      if (validatorClosed) await validatorClosed;
      if (source?.isInitialized) await source.destroy();
      // Only the random database successfully created by this test is removed.
      if (created) admin(`DROP DATABASE "${database}";`);
    }
  }, 30000);

  it('persists migration, revisions and audit; matching reads unprepared/draft/confirmed/stale safely', async () => {
    const job = await fixture();
    expect((await matchingRead(job)).status).toBe('UNPREPARED');
    const created = await request(app.getHttpServer())
      .post(route(job) + '/drafts')
      .set(identity())
      .send({ expectedLatestRevision: 0 })
      .expect(201);
    const draft = created.body.data as PlanInspection;
    expect((await matchingRead(job)).status).toBe('DRAFT');
    const edited = await request(app.getHttpServer())
      .patch(route(job))
      .set(identity())
      .send({
        expectedContentSha256: draft.content_sha256,
        requirements: [
          {
            requirement_id: 'requirements/0',
            original_text: job.requirements,
            joint_context_required: false,
            components: [
              { id: 'sql', query: 'Use SQL.', source_quote: 'SQL', importance: 'core' },
              {
                id: 'aws',
                query: 'Deploy on AWS.',
                source_quote: 'deploy on AWS',
                importance: 'core',
              },
            ],
            all_of: [['sql'], ['aws']],
          },
        ],
      })
      .expect(200);
    const confirmed = await request(app.getHttpServer())
      .post(route(job) + '/confirm')
      .set(identity())
      .send({ expectedContentSha256: edited.body.data.content_sha256 })
      .expect(200);
    expect(confirmed.body.data.plan.approval.reviewer_id).toBe(hr.id);
    expect(await matchingRead(job)).toMatchObject({
      status: 'HR_CONFIRMED',
      confirmed: true,
      candidate_support_verified: false,
    });
    expect(await source.getRepository(JobRequirementPlan).countBy({ jobId: job.id })).toBe(2);
    expect(await source.getRepository(JobRequirementPlanEvent).countBy({ jobId: job.id })).toBe(3);
    await source.getRepository(Job).update(job.id, { title: job.title + ' updated' });
    const updated = await source.getRepository(Job).findOneByOrFail({ id: job.id });
    expect(await matchingRead(updated)).toMatchObject({ status: 'STALE', confirmed: false });
    expect(await matchingRead(job)).toMatchObject({
      status: 'STALE',
      confirmed: false,
      reason: 'JD_CHANGED_BETWEEN_SNAPSHOT_AND_PLAN_READ',
    });
    await request(app.getHttpServer())
      .post(route(job) + '/confirm')
      .set(identity())
      .send({ expectedContentSha256: edited.body.data.content_sha256 })
      .expect(409);
    expect(updated.status).toBe('PUBLISHED');
  }, 30000);

  it('serializes two HR draft creations; one wins and the other receives a conflict', async () => {
    const job = await fixture();
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(route(job) + '/drafts')
          .set(identity())
          .send({ expectedLatestRevision: 0 }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await source.getRepository(JobRequirementPlan).countBy({ jobId: job.id })).toBe(1);
    expect(await source.getRepository(JobRequirementPlanEvent).countBy({ jobId: job.id })).toBe(1);
  });

  it('serializes two edits of the same base hash without losing a revision', async () => {
    const job = await fixture();
    const draft = await service.createDraft(hr, job.id, { expectedLatestRevision: 0 });
    const edits = await Promise.allSettled(
      [1, 2].map(() =>
        service.edit(hr, job.id, {
          expectedContentSha256: draft.content_sha256!,
          requirements: draft.plan!.requirements,
        }),
      ),
    );
    expect(edits.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(edits.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await source.getRepository(JobRequirementPlan).countBy({ jobId: job.id })).toBe(2);
  });

  it('makes concurrent confirmations idempotent and stores one exact authorization event', async () => {
    const job = await fixture();
    const draft = await service.createDraft(hr, job.id, { expectedLatestRevision: 0 });
    const other = { ...hr, id: randomUUID() };
    const results = await Promise.all(
      [hr, other].map((user) =>
        service.confirm(user, job.id, { expectedContentSha256: draft.content_sha256! }),
      ),
    );
    expect(results.every((r) => r.status === 'HR_CONFIRMED')).toBe(true);
    const events = await source
      .getRepository(JobRequirementPlanEvent)
      .findBy({ jobId: job.id, action: 'CONFIRMED' });
    expect(events).toHaveLength(1);
    expect(results[0].plan!.approval!.authorization_event_id).toBe(events[0].id);
    expect(results[1].plan!.approval!.authorization_event_id).toBe(events[0].id);
  });

  it('rolls back plan insertion if the audit insert fails', async () => {
    const job = await fixture();
    await source.query(`CREATE FUNCTION fail_plan_test_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'intentional local audit test failure'; END; $$`);
    await source.query(
      'CREATE TRIGGER fail_plan_test_event BEFORE INSERT ON job_requirement_plan_events FOR EACH ROW EXECUTE FUNCTION fail_plan_test_event()',
    );
    try {
      await expect(service.createDraft(hr, job.id, { expectedLatestRevision: 0 })).rejects.toThrow(
        'intentional local audit test failure',
      );
      expect(await source.getRepository(JobRequirementPlan).countBy({ jobId: job.id })).toBe(0);
      expect(await source.getRepository(JobRequirementPlanEvent).countBy({ jobId: job.id })).toBe(
        0,
      );
    } finally {
      await source.query('DROP TRIGGER fail_plan_test_event ON job_requirement_plan_events');
      await source.query('DROP FUNCTION fail_plan_test_event()');
    }
  });

  it('does not confirm against a JD concurrently changed in another transaction', async () => {
    const job = await fixture();
    const draft = await service.createDraft(hr, job.id, { expectedLatestRevision: 0 });
    const runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.manager.update(Job, job.id, { title: job.title + ' changed during review' });
      const pending = service.confirm(hr, job.id, { expectedContentSha256: draft.content_sha256! });
      let locked = false;
      for (let i = 0; i < 50; i++) {
        const rows = await source.query(
          "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock') AS blocked",
        );
        if (rows[0].blocked) {
          locked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(locked).toBe(true);
      await runner.commitTransaction();
      await expect(pending).rejects.toThrow('JD changed');
      expect(
        await source
          .getRepository(JobRequirementPlanEvent)
          .countBy({ jobId: job.id, action: 'CONFIRMED' }),
      ).toBe(0);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('rejects another company and service reads without the internal token', async () => {
    const job = await fixture();
    await request(app.getHttpServer())
      .get(route(job))
      .set(identity({ ...hr, companyId: randomUUID() }))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/internal/jobs/${job.id}/requirement-plan`)
      .set({ 'x-user-id': 'matching-service', 'x-user-role': 'ADMIN' })
      .expect(401);
    expect(await source.getRepository(JobRequirementPlan).countBy({ jobId: job.id })).toBe(0);
  });

  const modelFlow = process.env.RUN_JD_PLAN_MODEL_FLOW === '1' ? it : it.skip;
  modelFlow('runs real API enqueue/worker/model/result flow on synthetic CVs with fixed plans', async () => {
    const job = await fixture();
    await source.getRepository(Job).update(job.id, {
      title: 'Backend platform engineer',
      requirements: 'Administer PostgreSQL databases and deploy services on AWS.',
      workingType: 'REMOTE' as Job['workingType'], experienceLevel: 'JUNIOR' as Job['experienceLevel'], location: 'Ha Noi',
    });
    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn(python, ['-B', path.resolve('training/ai1/run_local_worker_flow.py')], {
        cwd: path.resolve('apps/matching-service'), windowsHide: true,
        env: { ...process.env, NODE_ENV: 'test', DB_HOST: settings.DB_HOST, DB_PORT: settings.DB_PORT,
          DB_SSL: 'false', MATCHING_SERVICE_DB_NAME: database,
          MATCHING_SERVICE_DB_USER: settings.JOB_SERVICE_DB_USER, MATCHING_SERVICE_DB_PASS: settings.JOB_SERVICE_DB_PASS,
          INTERNAL_SERVICE_TOKEN: settings.INTERNAL_SERVICE_TOKEN, JOB_SERVICE_URL: appUrl },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let output = '', error = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('Local model flow timed out')); }, 220000);
      child.stdout.on('data', (chunk) => { output += chunk.toString(); });
      child.stderr.on('data', (chunk) => { error += chunk.toString(); });
      child.once('error', () => { clearTimeout(timer); reject(new Error('Local model flow could not start')); });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          for (const key of ['INTERNAL_SERVICE_TOKEN', 'JOB_SERVICE_DB_PASS']) error = error.split(settings[key]).join('[redacted]');
          reject(new Error('Local model flow failed: ' + error.slice(-5000)));
        } else resolve(output);
      });
      child.stdin.end(JSON.stringify({ job_id: job.id, hr_id: hr.id, company_id: hr.companyId }));
    });
    const summary = JSON.parse(result.trim().split(/\r?\n/).pop()!);
    const independentM1 = process.env.AI1_WORKER_TEST_BACKEND === 'local_m1';
    expect(summary.requests_succeeded).toBe(independentM1 ? 10 : 6);
    expect(summary.all_pending_hr_review).toBe(!independentM1);
    expect(summary.all_candidates_unverified).toBe(true);
    expect(summary.paid_api_calls).toBe(0);
  }, 240000);
});
