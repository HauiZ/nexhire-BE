import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AuthUser, UserRole } from '@nexhire/shared';
import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { DataSource } from 'typeorm';
import { Job } from '../entities/job.entity';
import {
  JobRequirementPlan,
  JobRequirementPlanEvent,
} from '../entities/job-requirement-plan.entity';
import { PlanContractClient } from './plan-contract.client';
import { RequirementPlanService } from './requirement-plan.service';

const python = path.resolve(
  'apps/matching-service/.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const suite = existsSync(python) ? describe : describe.skip;

suite('JD plan real Node-to-Python HTTP contract (in-memory storage, not PostgreSQL E2E)', () => {
  let child: ChildProcess;
  let closed: Promise<void>;
  let client: PlanContractClient;

  beforeAll(async () => {
    const code = [
      'import socket, uvicorn',
      'from fastapi import FastAPI',
      'from types import SimpleNamespace',
      'import app.api.jd_plans as plans',
      'import app.schemas.query_budget as budgets',
      "budgets._tokenizer = lambda *args: (lambda texts, **kw: {'input_ids': [[0] * (257 if 'overlong_test' in t.lower() else 5) for t in texts]})",
      "plans.get_settings = lambda: SimpleNamespace(internal_service_token='local-contract-fixture', ai1_manifest_path='fixture', ai1_manifest_sha256='fixture')",
      'sock = socket.socket()',
      "sock.bind(('127.0.0.1', 0))",
      'sock.listen(128)',
      'async def ready():',
      "    print('READY:' + str(sock.getsockname()[1]), flush=True)",
      'app = FastAPI(on_startup=[ready])',
      "app.include_router(plans.router, prefix='/api/v1')",
      "uvicorn.Server(uvicorn.Config(app, log_level='error')).run(sockets=[sock])",
    ].join('\n');
    child = spawn(python, ['-B', '-c', code], {
      cwd: path.resolve('apps/matching-service'),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    closed = new Promise((resolve) => child.once('close', () => resolve()));
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Python contract server startup timeout')),
        15000,
      );
      let output = '';
      child.stdout!.on('data', (chunk) => {
        output += chunk.toString();
        const match = output.match(/READY:(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
      child.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.once('exit', (status) => {
        clearTimeout(timer);
        reject(new Error(`Contract server exited ${status}`));
      });
    });
    const values: Record<string, string> = {
      'jobService.services.matchingService': `http://127.0.0.1:${port}`,
      'jobService.internalServiceToken': 'local-contract-fixture',
    };
    client = new PlanContractClient(new HttpService(), {
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    } as ConfigService);
  }, 20000);

  afterAll(async () => {
    if (child && child.exitCode === null) child.kill();
    if (closed) await closed;
  });

  it('roundtrips opt-in v2 selection, HR confirmation and stale inspection', async () => {
    const job = Object.assign(new Job(), {
      id: 'job-v2',
      companyId: 'company-contract',
      title: 'Backend',
      skills: [],
      requirements: 'Requirements: Node.js\nPreferred: Docker',
      description: 'Build APIs.',
      benefits: 'Insurance',
    });
    const plans: JobRequirementPlan[] = [];
    const manager = {
      findOne: async (entity: unknown) => (entity === Job ? job : (plans.at(-1) ?? null)),
      create: (_entity: unknown, value: unknown) => value,
      save: async (entity: unknown, value: JobRequirementPlan) => {
        if (entity === JobRequirementPlan) {
          const index = plans.findIndex((p) => p.id === value.id);
          if (index < 0) plans.push(value);
          else plans[index] = value;
        }
        return value;
      },
    };
    const service = new RequirementPlanService(
      {
        transaction: async (fn: (m: unknown) => Promise<unknown>) => fn(manager),
      } as unknown as DataSource,
      client,
    );
    const user: AuthUser = {
      id: 'hr-contract',
      companyId: 'company-contract',
      role: UserRole.RECRUITER,
    };
    const draft = await service.createDraft(user, job.id, {
      expectedLatestRevision: 0,
      schemaVersion: 'jd-source-query-v2',
    });
    expect(draft.plan!.schema_version).toBe('jd-source-query-v2');
    expect(draft.plan!.sources!.flatMap((s) => s.components.map((c) => c.query))).toEqual([
      'Node.js',
      'Docker',
    ]);
    await expect(
      service.edit(user, job.id, {
        expectedContentSha256: draft.content_sha256!,
        requirements: [],
      }),
    ).rejects.toThrow('stored plan schema');
    const edited = await service.edit(user, job.id, {
      expectedContentSha256: draft.content_sha256!,
      sources: draft.plan!.sources!,
    });
    const confirmed = await service.confirm(user, job.id, {
      expectedContentSha256: edited.content_sha256!,
    });
    expect(confirmed.status).toBe('HR_CONFIRMED');
    expect((await service.getInternal(job.id)).status).toBe('HR_CONFIRMED');
    job.requirements = 'Requirements: OVERLONG_TEST SQL';
    const longDraft = await service.createDraft(user, job.id, {
      expectedLatestRevision: 2,
      schemaVersion: 'jd-source-query-v2',
    });
    expect(longDraft.query_budget?.status).toBe('TOO_LONG');
    await expect(
      service.confirm(user, job.id, {
        expectedContentSha256: longDraft.content_sha256!,
      }),
    ).rejects.toThrow('Split the indicated source quotes');
    const repaired = longDraft.plan!.sources!.map((s) =>
      s.selected
        ? {
            ...s,
            components: [
              { id: 'short', query: 'SQL', source_quote: 'SQL', importance: 'unknown' as const },
            ],
          }
        : s,
    );
    const shortDraft = await service.edit(user, job.id, {
      expectedContentSha256: longDraft.content_sha256!,
      sources: repaired,
    });
    expect(shortDraft.query_budget?.status).toBe('READY');
    expect(
      (
        await service.confirm(user, job.id, {
          expectedContentSha256: shortDraft.content_sha256!,
        })
      ).status,
    ).toBe('HR_CONFIRMED');
    job.benefits = 'Changed benefits';
    expect((await service.get(user, job.id)).status).toBe('STALE');
  });

  it('drafts, edits, confirms and invalidates the exact snapshot without verifying candidate support', async () => {
    const job = Object.assign(new Job(), {
      id: 'job-contract',
      companyId: 'company-contract',
      title: 'Analyst ti\u1ebfng Vi\u1ec7t',
      requirements: 'Use SQL and deploy on AWS.',
      skills: [],
      description: null,
    });
    const plans: JobRequirementPlan[] = [];
    const events: JobRequirementPlanEvent[] = [];
    const manager = {
      findOne: async (entity: unknown) =>
        entity === Job ? job : (plans[plans.length - 1] ?? null),
      create: (_entity: unknown, value: unknown) => value,
      save: async (entity: unknown, value: JobRequirementPlan & JobRequirementPlanEvent) => {
        if (entity === JobRequirementPlan) {
          const index = plans.findIndex((p) => p.id === value.id);
          if (index < 0) plans.push(value);
          else plans[index] = value;
        } else events.push(value);
        return value;
      },
    };
    const service = new RequirementPlanService(
      {
        transaction: async (fn: (m: unknown) => Promise<unknown>) => fn(manager),
      } as unknown as DataSource,
      client,
    );
    const user: AuthUser = {
      id: 'hr-contract',
      companyId: 'company-contract',
      role: UserRole.RECRUITER,
    };
    expect((await service.get(user, job.id)).status).toBe('UNPREPARED');
    const draft = await service.createDraft(user, job.id, { expectedLatestRevision: 0 });
    const edited = await service.edit(user, job.id, {
      expectedContentSha256: draft.content_sha256!,
      requirements: [
        {
          requirement_id: 'requirements/0',
          original_text: job.requirements!,
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
    });
    expect(edited.plan!.revision).toBe(2);
    expect(edited.plan!.approval).toBeNull();
    const confirmed = await service.confirm(user, job.id, {
      expectedContentSha256: edited.content_sha256!,
    });
    expect(confirmed.status).toBe('HR_CONFIRMED');
    expect(confirmed.candidate_support_verified).toBe(false);
    expect(confirmed.plan!.requirements![0].all_of).toEqual([['sql'], ['aws']]);
    expect(events.map((event) => event.action)).toEqual(['CREATED', 'REVISED', 'CONFIRMED']);
    await service.confirm(user, job.id, { expectedContentSha256: edited.content_sha256! });
    expect(events).toHaveLength(3);
    job.requirements += ' Use Docker.';
    const stale = await service.get(user, job.id);
    expect(stale.status).toBe('STALE');
    expect(stale.publishing_blocked).toBe(false);
    await expect(
      service.confirm(user, job.id, { expectedContentSha256: edited.content_sha256! }),
    ).rejects.toThrow('JD changed');
  });
});
