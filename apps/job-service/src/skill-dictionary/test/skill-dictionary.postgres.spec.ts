/**
 * Opt-in real PostgreSQL/service test, not JWT/API/parser/model E2E.
 * Operator owns provisioning/cleanup. No dotenv, discovery, shared DB, or privilege escalation.
 * SKILL_DICTIONARY_TEST_DB_URL / _DB_NAME / _DB_ROLE must pin one EMPTY owned loopback DB.
 */
import { ConflictException } from '@nestjs/common';
import { UserRole } from '@nexhire/shared';
import { createHash, randomUUID } from 'crypto';
import { DataSource, Logger, QueryRunner } from 'typeorm';
import { CreateSkillDictionary1794873600000 } from '../../migrations/1794873600000-CreateSkillDictionary';
import {
  DictionaryAudit,
  DictionaryName,
  DictionarySkill,
  DictionarySnapshot,
  DICTIONARY_NORMALIZATION_VERSION,
} from '../entities/dictionary-skill.entity';
import { SkillDictionaryService } from '../skill-dictionary.service';

const suite = process.env.SKILL_DICTIONARY_TEST_DB_URL ? describe : describe.skip;
suite('Skill dictionary real isolated PostgreSQL', () => {
  let source: DataSource;
  let service: SkillDictionaryService;
  let migratedUpDownUp = false;
  const actor = { id: randomUUID(), role: UserRole.ADMIN };
  const applicationName = 'skill_dictionary_it_' + randomUUID().replace(/-/g, '');
  const errorCodes: string[] = [];
  const logger: Logger = {
    logQuery() {},
    logQueryError: (error) => {
      errorCodes.push((error as unknown as { code?: string }).code ?? 'unknown');
    },
    logQuerySlow() {},
    logSchemaBuild() {},
    logMigration() {},
    log() {},
  };
  const term = (suffix = '') => `SYNTHETIC-${randomUUID()}${suffix}`;
  const create = (name = term(), aliases: string[] = []) =>
    service.create(actor, { name, aliases, reason: 'SYNTHETIC isolated integration fixture.' });
  const state = async () => ({
    skills: await source.getRepository(DictionarySkill).find({ order: { id: 'ASC' } }),
    names: await source.getRepository(DictionaryName).find({ order: { normalizedName: 'ASC' } }),
    audit: await source.getRepository(DictionaryAudit).find({ order: { id: 'ASC' } }),
  });
  const snapshot = (skill: DictionarySkill): DictionarySnapshot => ({
    id: skill.id,
    name: skill.name,
    aliases: [...skill.aliases],
    status: skill.status,
    revision: skill.revision,
    normalizationVersion: DICTIONARY_NORMALIZATION_VERSION,
  });
  const hash = (value: DictionarySnapshot) =>
    createHash('sha256')
      .update(
        JSON.stringify({
          id: value.id,
          name: value.name,
          aliases: [...value.aliases],
          status: value.status,
          revision: value.revision,
          normalizationVersion: value.normalizationVersion,
        }),
      )
      .digest('hex');

  beforeAll(async () => {
    let url: URL;
    try {
      url = new URL(process.env.SKILL_DICTIONARY_TEST_DB_URL!);
    } catch {
      throw new Error('Explicit disposable PostgreSQL URL required');
    }
    const database = process.env.SKILL_DICTIONARY_TEST_DB_NAME;
    const role = process.env.SKILL_DICTIONARY_TEST_DB_ROLE;
    if (
      !database ||
      !/^nexhire_skill_dictionary_it_[a-f0-9]{16}$/.test(database) ||
      role !== database ||
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' ||
      !/^\d+$/.test(url.port) ||
      Number(url.port) < 1024 ||
      Number(url.port) > 65535 ||
      url.port === '5432' ||
      url.pathname !== '/' + database ||
      decodeURIComponent(url.username) !== role ||
      !url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Only explicitly pinned disposable loopback DB/role/port allowed');
    source = new DataSource({
      type: 'postgres',
      host: '127.0.0.1',
      port: Number(url.port),
      database,
      username: role,
      password: decodeURIComponent(url.password),
      ssl: false,
      entities: [DictionarySkill, DictionaryName, DictionaryAudit],
      synchronize: false,
      migrationsRun: false,
      logging: ['error'],
      logger,
      connectTimeoutMS: 5000,
      extra: { max: 7, application_name: applicationName, statement_timeout: 10000 },
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
        (SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS types,
        (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS functions`);
      if (empty.relations || empty.schemas || empty.types || empty.functions)
        throw new Error('not empty');
      runner = source.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      const migration = new CreateSkillDictionary1794873600000();
      await migration.up(runner);
      await migration.down(runner);
      const [removed] =
        await runner.query(`SELECT (SELECT count(*)::int FROM pg_class WHERE relnamespace='public'::regnamespace) AS relations,
        (SELECT count(*)::int FROM pg_proc WHERE pronamespace='public'::regnamespace) AS functions`);
      if (removed.relations !== 0 || removed.functions !== 0) throw new Error('down incomplete');
      await migration.up(runner);
      await runner.commitTransaction();
      migratedUpDownUp = true;
      service = new SkillDictionaryService(source);
    } catch {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
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
  beforeEach(() => {
    errorCodes.length = 0;
  });

  it('runs migration up/down/up and rereads JSONB/audit hash from a fresh connection', async () => {
    expect(migratedUpDownUp).toBe(true);
    const skill = await create(term(), ['Zeta ' + randomUUID(), 'Alpha ' + randomUUID()]);
    const reader = source.createQueryRunner();
    await reader.connect();
    try {
      const persisted = await reader.manager.findOneByOrFail(DictionarySkill, { id: skill.id });
      const audit = await reader.manager.findOneByOrFail(DictionaryAudit, {
        skillId: skill.id,
        afterRevision: 1,
      });
      expect(persisted.aliases).toEqual(skill.aliases);
      expect(persisted.snapshotSha256).toBe(hash(snapshot(persisted)));
      expect(audit.afterSha256).toBe(hash(audit.after));
      expect(audit.after).toEqual(snapshot(persisted));
      expect(audit).toMatchObject({
        actorId: actor.id,
        result: 'APPLIED',
        before: null,
        beforeRevision: null,
      });
      expect(await reader.manager.countBy(DictionaryName, { skillId: skill.id })).toBe(3);
      // SQL NULL must not bypass UPDATE audit metadata constraints.
      await expect(
        reader.query(
          `INSERT INTO dictionary_audit(id,skill_id,actor_id,action,result,reason,before_revision,after_revision,"before","after",before_sha256,after_sha256,occurred_at)
        VALUES($1,$2,$3,'UPDATE','APPLIED','SYNTHETIC invalid audit',NULL,2,'{}','{}',$4,$4,now())`,
          [randomUUID(), skill.id, actor.id, 'a'.repeat(64)],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await reader.release();
    }
  });

  it('enforces one DB namespace across canonical and alias names without conflating punctuation/diacritics', async () => {
    const canonical = term();
    const alias = term();
    await create(canonical, [alias]);
    const before = JSON.stringify(await state());
    for (const [name, aliases] of [
      [alias.toUpperCase(), []],
      [term(), [canonical.toUpperCase()]],
    ] as [string, string[]][])
      await expect(create(name, aliases)).rejects.toBeInstanceOf(ConflictException);
    expect(JSON.stringify(await state())).toBe(before);
    const prefix = term();
    for (const suffix of [' C', ' C++', ' C#', ' .NET', ' NET', ' café', ' cafe'])
      await create(prefix + suffix);
    const original = await create('  ＰＹ ' + randomUUID());
    expect(original.name.startsWith('PY ')).toBe(true);
    await expect(create(original.name.toLowerCase())).rejects.toBeInstanceOf(ConflictException);
  });

  it('preserves renamed/retired reservations, permits only same-owner reactivation and retains audit history', async () => {
    const old = term();
    const removedAlias = term();
    const skill = await create(old, [removedAlias]);
    const renamed = term();
    await service.update(actor, skill.id, {
      name: renamed,
      aliases: [],
      status: 'RETIRED',
      expectedRevision: 1,
      reason: 'SYNTHETIC rename/retire.',
    });
    const afterRetire = await service.detail(actor, skill.id);
    expect(afterRetire.reservedNames.map((row) => row.normalizedName)).toEqual(
      expect.arrayContaining([old.toLowerCase(), removedAlias.toLowerCase()]),
    );
    for (const name of [old, removedAlias, renamed])
      await expect(create(name)).rejects.toBeInstanceOf(ConflictException);
    const active = await service.update(actor, skill.id, {
      name: old,
      aliases: [removedAlias],
      status: 'ACTIVE',
      expectedRevision: 2,
      reason: 'SYNTHETIC same-owner reactivation.',
    });
    expect(active.revision).toBe(3);
    const beforeNoop = JSON.stringify(await state());
    await service.update(actor, skill.id, {
      name: old,
      aliases: [removedAlias],
      status: 'ACTIVE',
      expectedRevision: 3,
      reason: 'No state change.',
    });
    await expect(
      service.update(actor, skill.id, {
        name: old,
        aliases: [removedAlias],
        status: 'ACTIVE',
        expectedRevision: 2,
        reason: 'Stale no-op.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(JSON.stringify(await state())).toBe(beforeNoop);
    const history = await service.history(actor, skill.id, {} as never);
    expect(history.items.map((row) => row.afterRevision)).toEqual([3, 2, 1]);
    expect(history.items[2].after).toMatchObject({ name: old, status: 'ACTIVE', revision: 1 });
    const beforeDeniedDelete = JSON.stringify(await state());
    await expect(
      source.query('DELETE FROM dictionary_audit WHERE skill_id=$1', [skill.id]),
    ).rejects.toMatchObject({ code: 'P0001' });
    expect(JSON.stringify(await state())).toBe(beforeDeniedDelete);
    await expect(
      source.query('DELETE FROM dictionary_skills WHERE id=$1', [skill.id]),
    ).rejects.toMatchObject({ code: '23001' }); // ON DELETE RESTRICT: restrict_violation.
    expect(JSON.stringify(await state())).toBe(beforeDeniedDelete);
    expect(await service.history(actor, skill.id, {} as never)).toEqual(history);
  });

  async function waitBlocked(count: number) {
    const deadline = Date.now() + 5000;
    let observed = 0;
    while (Date.now() < deadline) {
      const [row] = await source.query(
        `SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE application_name=$1 AND wait_event_type='Lock' AND state='active'`,
        [applicationName],
      );
      observed = row.count;
      if (observed === count) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(observed).toBe(count);
  }
  const exactlyOne = (outcomes: PromiseSettledResult<unknown>[]) => {
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const loser = outcomes.find(
      (outcome) => outcome.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(ConflictException);
  };

  it('arbitrates concurrent same expectedRevision: exactly one winner and one409 with immutable prior history', async () => {
    const skill = await create();
    const before = JSON.stringify(
      await source.getRepository(DictionaryAudit).findBy({ skillId: skill.id }),
    );
    const lock = source.createQueryRunner();
    await lock.connect();
    await lock.startTransaction();
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await lock.query('SELECT id FROM dictionary_skills WHERE id=$1 FOR UPDATE', [skill.id]);
      pending = Promise.allSettled(
        [1, 2].map((number) =>
          service.update(actor, skill.id, {
            name: term(String(number)),
            aliases: [],
            status: 'ACTIVE',
            expectedRevision: 1,
            reason: 'SYNTHETIC concurrent change.',
          }),
        ),
      );
      await waitBlocked(2);
    } finally {
      if (lock.isTransactionActive) await lock.commitTransaction();
      await lock.release();
    }
    exactlyOne(await pending!);
    const audits = await source
      .getRepository(DictionaryAudit)
      .find({ where: { skillId: skill.id }, order: { afterRevision: 'ASC' } });
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits.slice(0, 1))).toBe(before);
    expect((await service.detail(actor, skill.id)).revision).toBe(2);
  }, 15000);

  it('arbitrates cross-skill concurrent canonical/alias collision and rolls back every losing partial claim', async () => {
    const shared = term();
    const privateName = term();
    const before = await state();
    const lock = source.createQueryRunner();
    await lock.connect();
    await lock.startTransaction();
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await lock.query('LOCK TABLE dictionary_names IN SHARE MODE');
      pending = Promise.allSettled([create(shared, [term()]), create(privateName, [shared])]);
      await waitBlocked(2);
    } finally {
      if (lock.isTransactionActive) await lock.commitTransaction();
      await lock.release();
    }
    exactlyOne(await pending!);
    expect(errorCodes).toContain('23505');
    const after = await state();
    expect(after.skills).toHaveLength(before.skills.length + 1);
    expect(after.audit).toHaveLength(before.audit.length + 1);
    const owners = after.names.filter((row) => row.normalizedName === shared.toLowerCase());
    expect(owners).toHaveLength(1);
    const added = after.skills.filter((row) => !before.skills.some((old) => old.id === row.id));
    expect(added).toHaveLength(1);
    expect(
      after.names
        .filter((row) => !before.names.some((old) => old.normalizedName === row.normalizedName))
        .every((row) => row.skillId === added[0].id),
    ).toBe(true);
  }, 15000);

  it('rolls back create/update entries, names and revisions when audit storage fails, preserving original23505', async () => {
    const skill = await create();
    const before = JSON.stringify(await state());
    // Test-only database fault seam: real audit INSERT fails after real domain/name writes.
    await source.query(`CREATE FUNCTION fail_dictionary_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'SYNTHETIC audit storage failure' USING ERRCODE='23505', CONSTRAINT='synthetic_audit_storage'; END; $$`);
    await source.query(
      `CREATE TRIGGER fail_dictionary_audit_test BEFORE INSERT ON dictionary_audit FOR EACH ROW EXECUTE FUNCTION fail_dictionary_audit_test()`,
    );
    try {
      for (const operation of [
        () => create(),
        () =>
          service.update(actor, skill.id, {
            name: term(),
            aliases: [term()],
            status: 'RETIRED',
            expectedRevision: 1,
            reason: 'SYNTHETIC audit rollback.',
          }),
      ]) {
        await expect(operation()).rejects.toMatchObject({
          code: '23505',
          constraint: 'synthetic_audit_storage',
        });
        expect(JSON.stringify(await state())).toBe(before);
      }
    } finally {
      await source.query('DROP TRIGGER fail_dictionary_audit_test ON dictionary_audit');
      await source.query('DROP FUNCTION fail_dictionary_audit_test()');
    }
  });
});
