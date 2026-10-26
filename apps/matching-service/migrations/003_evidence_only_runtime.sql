-- Apply to the matching-service database before starting the evidence-only worker.
-- DDL only: preserve every historical value. Rerunning is safe.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE
  target regclass := to_regclass('match_results');
  score_column text;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'match_results missing; apply 001/002 to the intended matching database first';
  END IF;
  FOREACH score_column IN ARRAY ARRAY[
    'total_score', 'skill_score', 'experience_score', 'education_score',
    'certification_score', 'project_score', 'preference_score', 'semantic_score'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = target AND attname = score_column AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'Expected score column % missing from %', score_column, target;
    END IF;
    EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', target, score_column);
    -- Prevent legacy server defaults from manufacturing zero for omitted values.
    EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP DEFAULT', target, score_column);
  END LOOP;
END $$;
COMMIT;
