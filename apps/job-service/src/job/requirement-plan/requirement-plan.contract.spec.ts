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
      "plans.get_settings = lambda: SimpleNamespace(internal_service_token='local-contract-fixture')",
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
    expect(confirmed.plan!.requirements[0].all_of).toEqual([['sql'], ['aws']]);
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
