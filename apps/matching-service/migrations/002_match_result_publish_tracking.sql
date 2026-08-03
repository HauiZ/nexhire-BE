DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'match_results'
      AND column_name = 'matching_completed_published_at'
  ) THEN
    ALTER TABLE match_results
      ADD COLUMN matching_completed_published_at timestamptz NULL;

    UPDATE match_results
    SET matching_completed_published_at = created_at
    WHERE matching_completed_published_at IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_match_results_unpublished_completed
  ON match_results (created_at)
  WHERE matching_completed_published_at IS NULL;
