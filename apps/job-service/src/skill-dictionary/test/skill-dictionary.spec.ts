/** Real DTO/controller/guards with a repository fixture, NOT database or JWT E2E. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { InternalAuthGuard, RolesGuard, UserRole, setupApp } from '@nexhire/shared';
import { randomUUID } from 'crypto';
import request from 'supertest';
import {
  DictionaryAudit,
  DictionaryName,
  DictionarySkill,
} from '../entities/dictionary-skill.entity';
import { SkillDictionaryController } from '../skill-dictionary.controller';
import { normalizeDictionaryName, SkillDictionaryService } from '../skill-dictionary.service';

const admin = { id: randomUUID(), role: UserRole.ADMIN };
const id = randomUUID();
const input = () => ({
  name: '  Ｐython  ',
  aliases: ['Py  Lang', 'CPython'],
  reason: 'Controlled dictionary maintenance.',
});
const stored = (): DictionarySkill => ({
  id,
  name: 'Python',
  aliases: ['CPython', 'Py Lang'],
  status: 'ACTIVE',
  revision: 1,
  snapshotSha256: 'a'.repeat(64),
  createdAt: new Date('2026-11-17T00:00:00Z'),
  updatedAt: new Date('2026-11-17T00:00:00Z'),
});
const update = () => ({
  ...input(),
  name: 'Python',
  status: 'ACTIVE' as const,
  expectedRevision: 1,
});

describe('Admin dictionary bounded contract', () => {
  const manager = {
    create: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    findBy: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    find: jest.fn(),
  };
  const repo = { findAndCount: jest.fn(), existsBy: jest.fn() };
  const source = { transaction: jest.fn(), getRepository: jest.fn() };
  const service = new SkillDictionaryService(source as never);
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SkillDictionaryController],
      providers: [
        { provide: SkillDictionaryService, useValue: service },
        { provide: APP_GUARD, useClass: InternalAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    setupApp(app, { serviceName: 'dictionary-component', swagger: false });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    type Work = (transaction: typeof manager) => Promise<unknown>;
    source.transaction.mockImplementation(async (...args: [Work] | [string, Work]) => {
      const work = args.length === 1 ? args[0] : args[1];
      return work(manager);
    });
    source.getRepository.mockReturnValue(repo);
    repo.findAndCount.mockResolvedValue([[], 0]);
    repo.existsBy.mockResolvedValue(true);
    manager.create.mockImplementation((_type, value) => value);
    manager.findBy.mockResolvedValue([]);
    manager.findOne.mockImplementation(async () => stored());
    manager.findOneBy.mockImplementation(async () => stored());
    manager.find.mockResolvedValue([]);
    manager.insert.mockResolvedValue({});
    manager.update.mockResolvedValue({ affected: 1 });
  });

  it('normalizes NFKC/whitespace/lowercase while preserving punctuation and diacritics', () => {
    expect(normalizeDictionaryName('  ＰＹＴＨＯＮ\t  Lang  ')).toBe('python lang');
    expect(['C', 'C++', 'C#', '.NET', 'NET', 'café', 'cafe'].map(normalizeDictionaryName)).toEqual([
      'c',
      'c++',
      'c#',
      '.net',
      'net',
      'café',
      'cafe',
    ]);
    expect(
      new Set(['C', 'C++', 'C#', '.NET', 'NET', 'café', 'cafe'].map(normalizeDictionaryName)).size,
    ).toBe(7);
  });
  it('creates ACTIVE revision1 with deterministic aliases and server-owned audit in one transaction', async () => {
    const result = await service.create(admin, input());
    expect(result).toMatchObject({
      name: 'Python',
      aliases: ['CPython', 'Py Lang'],
      revision: 1,
      status: 'ACTIVE',
      normalizationVersion: 'nfkc-whitespace-lower-v1',
    });
    expect(result.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    const audit = manager.insert.mock.calls.find(([type]) => type === DictionaryAudit)![1];
    expect(audit).toMatchObject({
      actorId: admin.id,
      result: 'APPLIED',
      action: 'CREATE',
      before: null,
      beforeRevision: null,
      afterRevision: 1,
      afterSha256: result.snapshotSha256,
    });
    expect(audit.occurredAt).toBeInstanceOf(Date);
    expect(audit.after.aliases).toEqual(['CPython', 'Py Lang']);
    expect(source.transaction).toHaveBeenCalledTimes(1);
  });
  it('checks ADMIN at service boundary before any repository/transaction, regardless company', async () => {
    for (const role of [UserRole.RECRUITER, UserRole.CANDIDATE]) {
      const user = { ...admin, role, companyId: randomUUID() };
      for (const operation of [
        () => service.create(user, input()),
        () => service.update(user, id, update()),
        () => service.list(user, {} as never),
        () => service.detail(user, id),
        () => service.history(user, id, {} as never),
      ])
        await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(source.transaction).not.toHaveBeenCalled();
    expect(source.getRepository).not.toHaveBeenCalled();
  });
  it('denies duplicates, bounds, blank/control names and forged fields before writes', async () => {
    for (const value of [
      { ...input(), aliases: ['python'] },
      { ...input(), aliases: ['Py', ' ＰＹ '] },
      { ...input(), name: ' ' },
      { ...input(), name: 'bad\u0000name' },
      { ...input(), aliases: Array(21).fill('a') },
      { ...input(), name: 'a'.repeat(121) },
      { ...input(), reason: ' ' },
      { ...input(), actorId: admin.id },
      { ...input(), revision: 10 },
      { ...input(), status: 'RETIRED' },
    ])
      await expect(service.create(admin, value)).rejects.toBeInstanceOf(BadRequestException);
    expect(source.transaction).not.toHaveBeenCalled();
  });
  it('treats alias permutation as no-op without timestamp/name/audit writes, after stale-revision validation', async () => {
    const result = await service.update(admin, id, update());
    expect(result.revision).toBe(1);
    expect(result.updatedAt).toEqual(stored().updatedAt);
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
    expect(manager.findBy).not.toHaveBeenCalled();
    await expect(
      service.update(admin, id, { ...update(), expectedRevision: 2 }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update(admin, id, { ...update(), reason: ' ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(manager.update).not.toHaveBeenCalled();
  });
  it('versions display case changes and records before/after without trusting client audit metadata', async () => {
    const result = await service.update(admin, id, { ...update(), name: 'PYTHON' });
    expect(result).toMatchObject({ revision: 2, name: 'PYTHON' });
    expect(manager.findOne).toHaveBeenCalledWith(
      DictionarySkill,
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    const audit = manager.insert.mock.calls.find(([type]) => type === DictionaryAudit)![1];
    expect(audit).toMatchObject({
      beforeRevision: 1,
      afterRevision: 2,
      before: { name: 'Python' },
      after: { name: 'PYTHON' },
    });
  });
  it('rejects globally reserved terms, including another skill aliases, and only maps conflict SQL codes', async () => {
    manager.findBy.mockResolvedValue([
      { normalizedName: 'python', skillId: randomUUID(), kind: 'RESERVED' },
    ]);
    await expect(service.create(admin, input())).rejects.toBeInstanceOf(ConflictException);
    for (const failure of [
      { code: '23505', constraint: 'dictionary_names_pkey' },
      { code: '40001' },
      { code: '40P01' },
    ]) {
      source.transaction.mockRejectedValueOnce(failure);
      await expect(service.create(admin, input())).rejects.toBeInstanceOf(ConflictException);
    }
    const failure = { code: 'P0001', message: 'audit storage failure' };
    source.transaction.mockRejectedValueOnce(failure);
    await expect(service.create(admin, input())).rejects.toBe(failure);
    const auditCollision = { code: '23505', constraint: 'dictionary_audit_pkey' };
    source.transaction.mockRejectedValueOnce(auditCollision);
    await expect(service.create(admin, input())).rejects.toBe(auditCollision);
  });
  it('reactivates names reserved for the same skill without transferring ownership', async () => {
    manager.findBy.mockResolvedValue([
      { normalizedName: 'py', skillId: id, kind: 'RESERVED', reservedAt: stored().createdAt },
    ]);
    await service.update(admin, id, { ...update(), aliases: ['Py'] });
    expect(manager.update).toHaveBeenCalledWith(
      DictionaryName,
      { normalizedName: 'py', skillId: id },
      expect.objectContaining({ skillId: id, kind: 'ALIAS', reservedAt: stored().createdAt }),
    );
  });
  it('bounds list/history pagination and returns explicit response fields', async () => {
    await service.list(admin, {} as never);
    expect(repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ take: 20, skip: 0 }));
    await service.history(admin, id, { page: 2, limit: 100 } as never);
    expect(repo.findAndCount).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 100, skip: 100 }),
    );
    for (const operation of [
      () => service.list(admin, { limit: 101 } as never),
      () => service.history(admin, id, { page: 0 } as never),
    ])
      await expect(operation()).rejects.toBeInstanceOf(BadRequestException);
  });

  const root = '/api/v1/admin/skill-dictionary';
  const post = (body: object, role: UserRole = UserRole.ADMIN) =>
    request(app.getHttpServer())
      .post(root)
      .set('x-user-id', admin.id)
      .set('x-user-role', role)
      .send(body);
  it('enforces actual internal identity/roles, UUID path and production ValidationPipe (not real JWT)', async () => {
    await request(app.getHttpServer()).post(root).send(input()).expect(401);
    await post(input(), UserRole.RECRUITER).expect(403);
    await post(input(), UserRole.CANDIDATE).expect(403);
    await post(input()).expect(201);
    await request(app.getHttpServer())
      .get(`${root}/bad-id`)
      .set('x-user-id', admin.id)
      .set('x-user-role', UserRole.ADMIN)
      .expect(400);
    for (const body of [
      { ...input(), name: 42 },
      { ...input(), reason: 42 },
      { ...input(), actorId: admin.id },
      { ...input(), aliases: [42] },
    ])
      await post(body).expect(400);
    await request(app.getHttpServer())
      .delete(`${root}/${id}`)
      .set('x-user-id', admin.id)
      .set('x-user-role', UserRole.ADMIN)
      .expect(404);
  });
});
