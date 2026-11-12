import { Test } from '@nestjs/testing';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InternalAuthGuard, RolesGuard, setupApp } from '@nexhire/shared';
import { createServer } from 'http';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { PreparationController } from '../preparation.controller';
import { PreparationService } from '../preparation.service';
import { CandidateService } from '../candidate.service';

const suite = process.env.RUN_CANDIDATE_BROWSER_TEST === '1' ? describe : describe.skip;
suite('Candidate browser real orchestration/model, synthetic ownership/parse storage', () => {
  it('renders private source evidence and rechecks without creating an application', async () => {
    const user = randomUUID(),
      candidate = randomUUID(),
      cv = randomUUID(),
      document = randomUUID(),
      job = randomUUID();
    const token = 'synthetic-candidate-test-only';
    let app: INestApplication | undefined;
    let python: ReturnType<typeof spawn> | undefined;
    const fixture = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === `/api/v1/jobs/${job}`)
        return res.end(
          JSON.stringify({
            success: true,
            data: {
              id: job,
              title: 'Database engineer',
              skills: ['PostgreSQL'],
              requirements: 'Requirements: Maintain database backups.',
            },
          }),
        );
      if (
        req.url === `/api/v1/internal/cv-parsing/cvs/${cv}/latest-result` &&
        req.headers['x-internal-service-token'] === token &&
        req.headers['x-user-id'] === user &&
        req.headers['x-user-role'] === 'CANDIDATE'
      )
        return res.end(
          JSON.stringify({
            success: true,
            data: {
              candidateId: candidate,
              candidateCvId: cv,
              documentId: document,
              normalizedPayload: {
                skills: [{ name: 'PostgreSQL' }],
                projects: [
                  {
                    name: 'Database',
                    description: 'Maintained PostgreSQL backups and tested restores.',
                  },
                ],
              },
            },
          }),
        );
      res.statusCode = 404;
      res.end('{}');
    });
    await new Promise<void>((r) => fixture.listen(0, '127.0.0.1', r));
    const address = fixture.address() as import('net').AddressInfo;
    try {
      const code = [
        'import socket,uvicorn',
        'from types import SimpleNamespace',
        'from pathlib import Path',
        'from fastapi import FastAPI',
        'import app.api.candidate_preparation as p',
        'import app.api.matching as matching',
        `settings=SimpleNamespace(internal_service_token='${token}',node_env='test',ai1_backend='local_m1',ai1_manifest_path=str(Path('../../trainning/ai1/exports/kaggle-ranking-v1/shadow-ranking-retention.json').resolve()),ai1_manifest_sha256='bdfc4c0aef381cc73de2447251a27d4f1381f3787606833f79657931190620d4')`,
        'p.get_settings=lambda:settings',
        'matching.get_settings=lambda:settings',
        'import torch',
        'torch.set_num_threads(2)',
        'torch.set_num_interop_threads(1)',
        'sock=socket.socket()',
        "sock.bind(('127.0.0.1',0))",
        'sock.listen(128)',
        'async def ready():',
        " print('READY:'+str(sock.getsockname()[1]),flush=True)",
        'app=FastAPI(on_startup=[ready])',
        "app.include_router(p.router,prefix='/api/v1')",
        "uvicorn.Server(uvicorn.Config(app,log_level='error')).run(sockets=[sock])",
      ].join('\n');
      python = spawn(
        path.resolve('apps/matching-service/.venv/Scripts/python.exe'),
        ['-B', '-c', code],
        {
          cwd: path.resolve('apps/matching-service'),
          env: {
            ...process.env,
            HF_HUB_OFFLINE: '1',
            TRANSFORMERS_OFFLINE: '1',
            MATCHING_SERVICE_DB_NAME: 'unused_candidate_fixture',
            MATCHING_SERVICE_DB_USER: 'fixture',
            MATCHING_SERVICE_DB_PASS: 'fixture',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
      let startupError = '';
      python.stderr!.on('data', (b) => {
        startupError += b.toString();
      });
      const port = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Preparation API startup timeout')), 20000);
        python!.stdout!.on('data', (b) => {
          const m = b.toString().match(/READY:(\d+)/);
          if (m) {
            clearTimeout(timer);
            resolve(Number(m[1]));
          }
        });
        python!.once('exit', () => {
          clearTimeout(timer);
          reject(new Error('Preparation API exited: ' + startupError.slice(-2000)));
        });
      });
      const values: Record<string, string> = {
        'candidateService.services.jobService': `http://127.0.0.1:${address.port}`,
        'candidateService.services.cvParsingService': `http://127.0.0.1:${address.port}`,
        'candidateService.services.matchingService': `http://127.0.0.1:${port}`,
        'candidateService.internalServiceToken': token,
      };
      const module = await Test.createTestingModule({
        imports: [HttpModule],
        controllers: [PreparationController],
        providers: [
          PreparationService,
          {
            provide: CandidateService,
            useValue: {
              getPreparationSource: async (id: string, selected: string) => {
                if (id !== user || selected !== cv) throw new Error('Not owned');
                return { candidateId: candidate, cvDocumentId: document };
              },
            },
          },
          { provide: ConfigService, useValue: { get: (key: string) => values[key] } },
          { provide: APP_GUARD, useClass: InternalAuthGuard },
          { provide: APP_GUARD, useClass: RolesGuard },
        ],
      }).compile();
      app = module.createNestApplication();
      setupApp(app, { serviceName: 'candidate-preparation-test', swagger: false });
      await app.listen(0, '127.0.0.1');
      const appOrigin = await app.getUrl();
      const endpoint = `${appOrigin}/api/v1/candidates/me/cvs/${cv}/jobs/${job}/preparation`;
      expect((await fetch(endpoint, { method: 'POST' })).status).toBe(401);
      expect(
        (
          await fetch(endpoint, {
            method: 'POST',
            headers: { 'x-user-id': user, 'x-user-role': 'HR' },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(endpoint.replace(cv, 'invalid-uuid'), {
            method: 'POST',
            headers: { 'x-user-id': user, 'x-user-role': 'CANDIDATE' },
          })
        ).status,
      ).toBe(400);
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn('node', ['tests/jd-plan/candidate-preparation-browser.mjs'], {
          cwd: path.resolve('../Nexthire-FE'),
          env: {
            ...process.env,
            CANDIDATE_TEST_ORIGIN: appOrigin,
            CANDIDATE_TEST_JOB: job,
            CANDIDATE_TEST_CV: cv,
            CANDIDATE_TEST_USER: user,
          },
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '',
          stderr = '';
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error('Candidate browser timeout'));
        }, 90000);
        child.stdout!.on('data', (b) => {
          stdout += b.toString();
        });
        child.stderr!.on('data', (b) => {
          stderr += b.toString();
        });
        child.once('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.once('close', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve(stdout);
          else reject(new Error(stderr.slice(-2500)));
        });
      });
      expect(output).toContain('realMatchingModel');
    } finally {
      if (app) await app.close();
      if (python && python.exitCode === null) python.kill();
      await new Promise<void>((r) => fixture.close(() => r()));
    }
  }, 120000);
});
