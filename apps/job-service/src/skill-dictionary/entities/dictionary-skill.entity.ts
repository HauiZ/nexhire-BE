import { Column, Entity, PrimaryColumn } from 'typeorm';

export const DICTIONARY_NORMALIZATION_VERSION = 'nfkc-whitespace-lower-v1' as const;
export type DictionaryStatus = 'ACTIVE' | 'RETIRED';
export interface DictionarySnapshot {
  id: string;
  name: string;
  aliases: string[];
  status: DictionaryStatus;
  revision: number;
  normalizationVersion: typeof DICTIONARY_NORMALIZATION_VERSION;
}

@Entity('dictionary_skills')
export class DictionarySkill {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'varchar', length: 120 }) name: string;
  @Column({ type: 'jsonb' }) aliases: string[];
  @Column({ type: 'varchar', length: 10 }) status: DictionaryStatus;
  @Column({ type: 'integer' }) revision: number;
  @Column({ name: 'snapshot_sha256', type: 'varchar', length: 64 }) snapshotSha256: string;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

/** A term is never released: noncurrent names remain RESERVED for the same skill. */
@Entity('dictionary_names')
export class DictionaryName {
  @PrimaryColumn({ name: 'normalized_name', type: 'varchar', length: 120 }) normalizedName: string;
  @Column({ name: 'skill_id', type: 'uuid' }) skillId: string;
  @Column({ name: 'display_name', type: 'varchar', length: 120 }) displayName: string;
  @Column({ type: 'varchar', length: 10 }) kind: 'CANONICAL' | 'ALIAS' | 'RESERVED';
  @Column({ name: 'reserved_at', type: 'timestamptz' }) reservedAt: Date;
}

/** Only accepted state changes are audited; rejected attempts are not persisted. */
@Entity('dictionary_audit')
export class DictionaryAudit {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ name: 'skill_id', type: 'uuid' }) skillId: string;
  @Column({ name: 'actor_id', type: 'uuid' }) actorId: string;
  @Column({ type: 'varchar', length: 10 }) action: 'CREATE' | 'UPDATE';
  @Column({ type: 'varchar', length: 10 }) result: 'APPLIED';
  @Column({ type: 'varchar', length: 500 }) reason: string;
  @Column({ name: 'before_revision', type: 'integer', nullable: true }) beforeRevision:
    | number
    | null;
  @Column({ name: 'after_revision', type: 'integer' }) afterRevision: number;
  @Column({ type: 'jsonb', nullable: true }) before: DictionarySnapshot | null;
  @Column({ type: 'jsonb' }) after: DictionarySnapshot;
  @Column({ name: 'before_sha256', type: 'varchar', length: 64, nullable: true }) beforeSha256:
    | string
    | null;
  @Column({ name: 'after_sha256', type: 'varchar', length: 64 }) afterSha256: string;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt: Date;
}
