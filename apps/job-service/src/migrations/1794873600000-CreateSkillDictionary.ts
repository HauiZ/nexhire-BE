import { MigrationInterface, QueryRunner } from 'typeorm';

/** Standalone administration registry; no parser, candidate or historical-snapshot remapping. */
export class CreateSkillDictionary1794873600000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE dictionary_skills (
      id uuid PRIMARY KEY, name varchar(120) NOT NULL, aliases jsonb NOT NULL CHECK (jsonb_typeof(aliases)='array' AND jsonb_array_length(aliases)<=20),
      status varchar(10) NOT NULL CHECK (status IN ('ACTIVE','RETIRED')), revision integer NOT NULL CHECK (revision>=1),
      snapshot_sha256 varchar(64) NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
      created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)`);
    await q.query(`CREATE TABLE dictionary_names (
      normalized_name varchar(120) COLLATE "C" PRIMARY KEY CHECK (length(normalized_name)>0),
      skill_id uuid NOT NULL REFERENCES dictionary_skills(id) ON DELETE RESTRICT,
      display_name varchar(120) NOT NULL, kind varchar(10) NOT NULL CHECK (kind IN ('CANONICAL','ALIAS','RESERVED')),
      reserved_at timestamptz NOT NULL)`);
    await q.query('CREATE INDEX idx_dictionary_names_skill ON dictionary_names(skill_id)');
    await q.query(`CREATE TABLE dictionary_audit (
      id uuid PRIMARY KEY, skill_id uuid NOT NULL REFERENCES dictionary_skills(id) ON DELETE RESTRICT,
      actor_id uuid NOT NULL, action varchar(10) NOT NULL CHECK (action IN ('CREATE','UPDATE')),
      result varchar(10) NOT NULL CHECK (result='APPLIED'), reason varchar(500) NOT NULL CHECK (length(trim(reason))>0),
      before_revision integer NULL, after_revision integer NOT NULL,
      "before" jsonb NULL, "after" jsonb NOT NULL, before_sha256 varchar(64) NULL CHECK (before_sha256 IS NULL OR before_sha256 ~ '^[a-f0-9]{64}$'),
      after_sha256 varchar(64) NOT NULL CHECK (after_sha256 ~ '^[a-f0-9]{64}$'),
      occurred_at timestamptz NOT NULL, UNIQUE(skill_id,after_revision),
      CHECK ((action='CREATE' AND before_revision IS NULL AND after_revision=1 AND "before" IS NULL AND before_sha256 IS NULL)
        OR (action='UPDATE' AND before_revision IS NOT NULL AND before_revision>=1 AND after_revision=before_revision+1 AND "before" IS NOT NULL AND before_sha256 IS NOT NULL)))`);
    await q.query(`CREATE FUNCTION reject_dictionary_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Dictionary audit is append-only'; END; $$`);
    await q.query(`CREATE TRIGGER dictionary_audit_append_only BEFORE UPDATE OR DELETE ON dictionary_audit
      FOR EACH ROW EXECUTE FUNCTION reject_dictionary_audit_mutation()`);
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE dictionary_audit');
    await q.query('DROP FUNCTION reject_dictionary_audit_mutation()');
    await q.query('DROP TABLE dictionary_names');
    await q.query('DROP TABLE dictionary_skills');
  }
}
