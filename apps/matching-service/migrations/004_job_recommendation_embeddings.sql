-- Derived public JD vectors, rebuilt by the opt-in Matching Service worker.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS job_recommendation_embeddings (
    job_id uuid NOT NULL,
    semantic_input_sha256 text NOT NULL CHECK (semantic_input_sha256 ~ '^[a-f0-9]{64}$'),
    manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
    policy text NOT NULL,
    vectors real[] NOT NULL CHECK (
        array_ndims(vectors) = 1
        AND cardinality(vectors) BETWEEN 384 AND 3456
        AND cardinality(vectors) % 384 = 0
        AND array_position(vectors, NULL::real) IS NULL
    ),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (job_id, semantic_input_sha256, manifest_sha256, policy)
);
CREATE INDEX IF NOT EXISTS idx_job_recommendation_embeddings_last_seen
    ON job_recommendation_embeddings (last_seen_at);
COMMIT;
