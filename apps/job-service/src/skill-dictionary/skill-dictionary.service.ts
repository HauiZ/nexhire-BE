import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser, PaginationQueryDto, UserRole } from '@nexhire/shared';
import { plainToInstance, ClassConstructor } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { createHash, randomUUID } from 'crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  CreateDictionarySkillDto,
  DictionaryListQueryDto,
  UpdateDictionarySkillDto,
} from './dto/skill-dictionary.dto';
import {
  DICTIONARY_NORMALIZATION_VERSION,
  DictionaryAudit,
  DictionaryName,
  DictionarySkill,
  DictionarySnapshot,
} from './entities/dictionary-skill.entity';

// Versioned admin registry semantics, deliberately independent of parser/model aliases.
export const normalizeDictionaryName = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
const displayName = (value: string) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const digest = (snapshot: DictionarySnapshot) =>
  createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

@Injectable()
export class SkillDictionaryService {
  constructor(private readonly source: DataSource) {}

  private admin(user: AuthUser) {
    if (user?.role !== UserRole.ADMIN || !isUUID(user.id))
      throw new ForbiddenException('Administrator required');
  }
  private input<T extends object>(type: ClassConstructor<T>, input: T): T {
    const value = plainToInstance(type, input);
    if (
      validateSync(value, {
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      }).length
    )
      throw new BadRequestException('Invalid dictionary input');
    return value;
  }
  private id(id: string) {
    if (!isUUID(id)) throw new BadRequestException('Invalid dictionary skill id');
  }
  private names(dto: CreateDictionarySkillDto) {
    const name = displayName(dto.name);
    const aliases = dto.aliases
      .map(displayName)
      .sort((a, b) => compare(normalizeDictionaryName(a), normalizeDictionaryName(b)));
    const all = [name, ...aliases].map(normalizeDictionaryName);
    if (
      all.some((term) => !term || term.length > 120 || /[\u0000-\u001f\u007f]/u.test(term)) ||
      new Set(all).size !== all.length
    )
      throw new BadRequestException('Names must be nonblank and unique after normalization');
    return { name, aliases };
  }
  private snapshot(skill: DictionarySkill): DictionarySnapshot {
    // Explicit field order and already sorted aliases make this digest JSONB-order independent.
    return {
      id: skill.id,
      name: skill.name,
      aliases: [...skill.aliases],
      status: skill.status,
      revision: skill.revision,
      normalizationVersion: DICTIONARY_NORMALIZATION_VERSION,
    };
  }
  private response(skill: DictionarySkill) {
    return {
      ...this.snapshot(skill),
      snapshotSha256: skill.snapshotSha256,
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
    };
  }
  async list(user: AuthUser, input: DictionaryListQueryDto) {
    this.admin(user);
    const query = this.input(DictionaryListQueryDto, input);
    const [rows, total] = await this.source.getRepository(DictionarySkill).findAndCount({
      where: query.status ? { status: query.status } : {},
      order: { name: 'ASC', id: 'ASC' },
      skip: query.skip,
      take: query.limit,
    });
    return {
      items: rows.map((row) => this.response(row)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async detail(user: AuthUser, id: string) {
    this.admin(user);
    this.id(id);
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const row = await manager.findOneBy(DictionarySkill, { id });
      if (!row) throw new NotFoundException('Dictionary skill not found');
      const reserved = await manager.find(DictionaryName, {
        where: { skillId: id, kind: 'RESERVED' },
        order: { normalizedName: 'ASC' },
      });
      return {
        ...this.response(row),
        reservedNames: reserved.map((term) => ({
          name: term.displayName,
          normalizedName: term.normalizedName,
        })),
      };
    });
  }
  async history(user: AuthUser, id: string, input: PaginationQueryDto) {
    this.admin(user);
    this.id(id);
    const query = this.input(PaginationQueryDto, input);
    if (!(await this.source.getRepository(DictionarySkill).existsBy({ id })))
      throw new NotFoundException('Dictionary skill not found');
    const [rows, total] = await this.source.getRepository(DictionaryAudit).findAndCount({
      where: { skillId: id },
      order: { afterRevision: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        skillId: row.skillId,
        actorId: row.actorId,
        action: row.action,
        result: row.result,
        reason: row.reason,
        beforeRevision: row.beforeRevision,
        afterRevision: row.afterRevision,
        before: row.before,
        after: row.after,
        beforeSha256: row.beforeSha256,
        afterSha256: row.afterSha256,
        occurredAt: row.occurredAt,
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  private async reserve(manager: EntityManager, skill: DictionarySkill, at: Date) {
    const terms = [skill.name, ...skill.aliases];
    const wanted = terms.map(normalizeDictionaryName);
    const existing = await manager.findBy(DictionaryName, { normalizedName: In(wanted) });
    if (existing.some((term) => term.skillId !== skill.id))
      throw new ConflictException('Dictionary name is reserved by another skill');
    await manager.update(DictionaryName, { skillId: skill.id }, { kind: 'RESERVED' });
    for (let i = 0; i < terms.length; i++) {
      const normalizedName = wanted[i];
      const owned = existing.find((term) => term.normalizedName === normalizedName);
      const value = {
        normalizedName,
        skillId: skill.id,
        displayName: terms[i],
        kind: i === 0 ? ('CANONICAL' as const) : ('ALIAS' as const),
        reservedAt: owned?.reservedAt ?? at,
      };
      if (owned) await manager.update(DictionaryName, { normalizedName, skillId: skill.id }, value);
      else await manager.insert(DictionaryName, value);
    }
  }
  private async audit(
    manager: EntityManager,
    user: AuthUser,
    skill: DictionarySkill,
    before: DictionarySnapshot | null,
    reason: string,
    at: Date,
  ) {
    const after = this.snapshot(skill);
    await manager.insert(DictionaryAudit, {
      id: randomUUID(),
      skillId: skill.id,
      actorId: user.id,
      action: before ? 'UPDATE' : 'CREATE',
      result: 'APPLIED',
      reason: reason.trim(),
      beforeRevision: before?.revision ?? null,
      afterRevision: skill.revision,
      before,
      after,
      beforeSha256: before ? digest(before) : null,
      afterSha256: digest(after),
      occurredAt: at,
    });
  }
  private async mutation<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      const failure = error as { code?: string; constraint?: string };
      if (
        (failure.code === '23505' && failure.constraint === 'dictionary_names_pkey') ||
        failure.code === '40001' ||
        failure.code === '40P01'
      )
        throw new ConflictException('Dictionary name or revision conflict');
      throw error;
    }
  }
  async create(user: AuthUser, input: CreateDictionarySkillDto) {
    this.admin(user);
    const dto = this.input(CreateDictionarySkillDto, input);
    const names = this.names(dto);
    return this.mutation(() =>
      this.source.transaction(async (manager) => {
        const at = new Date();
        const skill = manager.create(DictionarySkill, {
          id: randomUUID(),
          ...names,
          status: 'ACTIVE',
          revision: 1,
          createdAt: at,
          updatedAt: at,
        });
        skill.snapshotSha256 = digest(this.snapshot(skill));
        await manager.insert(DictionarySkill, skill);
        await this.reserve(manager, skill, at);
        await this.audit(manager, user, skill, null, dto.reason, at);
        return this.response(skill);
      }),
    );
  }
  async update(user: AuthUser, id: string, input: UpdateDictionarySkillDto) {
    this.admin(user);
    this.id(id);
    const dto = this.input(UpdateDictionarySkillDto, input);
    const names = this.names(dto);
    return this.mutation(() =>
      this.source.transaction(async (manager) => {
        const skill = await manager.findOne(DictionarySkill, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!skill) throw new NotFoundException('Dictionary skill not found');
        if (skill.revision !== dto.expectedRevision)
          throw new ConflictException('Dictionary revision changed. Reload before saving.');
        // Check revision before no-op detection; reason alone and alias permutations create no revision/audit.
        if (
          skill.name === names.name &&
          JSON.stringify(skill.aliases) === JSON.stringify(names.aliases) &&
          skill.status === dto.status
        )
          return this.response(skill);
        const before = this.snapshot(skill);
        const at = new Date();
        skill.name = names.name;
        skill.aliases = names.aliases;
        skill.status = dto.status;
        skill.revision++;
        skill.updatedAt = at;
        skill.snapshotSha256 = digest(this.snapshot(skill));
        await manager.update(
          DictionarySkill,
          { id },
          {
            name: skill.name,
            aliases: skill.aliases,
            status: skill.status,
            revision: skill.revision,
            snapshotSha256: skill.snapshotSha256,
            updatedAt: at,
          },
        );
        await this.reserve(manager, skill, at);
        await this.audit(manager, user, skill, before, dto.reason, at);
        return this.response(skill);
      }),
    );
  }
}
