CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_request_type') THEN
    CREATE TYPE match_request_type AS ENUM (
      'AUTO_APPLICATION',
      'RECRUITER_MANUAL',
      'JOB_RESCAN',
      'CV_RESCAN'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_request_status') THEN
    CREATE TYPE match_request_status AS ENUM (
      'PENDING',
      'PROCESSING',
      'SUCCEEDED',
      'FAILED',
      'CANCELLED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_provider') THEN
    CREATE TYPE match_provider AS ENUM ('INTERNAL', 'SKIMA', 'GEMINI');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_result_status') THEN
    CREATE TYPE match_result_status AS ENUM ('SUCCEEDED', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS match_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NULL,
  job_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  candidate_user_id uuid NULL,
  candidate_cv_id uuid NULL,
  cv_document_id uuid NULL,
  parsed_resume jsonb NULL,
  request_type match_request_type NOT NULL,
  status match_request_status NOT NULL DEFAULT 'PENDING',
  priority integer NOT NULL DEFAULT 100,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code varchar(120) NULL,
  last_error_message text NULL,
  requested_by_user_id uuid NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_requests_status_priority_created_at
  ON match_requests (status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_match_requests_application_id ON match_requests (application_id);
CREATE INDEX IF NOT EXISTS idx_match_requests_job_id ON match_requests (job_id);
ALTER TABLE match_requests ADD COLUMN IF NOT EXISTS parsed_resume jsonb NULL;

CREATE TABLE IF NOT EXISTS match_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NULL,
  job_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  candidate_cv_id uuid NULL,
  application_id uuid NULL,
  status match_result_status NOT NULL DEFAULT 'SUCCEEDED',
  provider match_provider NOT NULL DEFAULT 'INTERNAL',
  model_version varchar(80) NULL,
  total_score double precision NOT NULL,
  skill_score double precision NOT NULL DEFAULT 0,
  experience_score double precision NOT NULL DEFAULT 0,
  education_score double precision NOT NULL DEFAULT 0,
  certification_score double precision NOT NULL DEFAULT 0,
  project_score double precision NOT NULL DEFAULT 0,
  preference_score double precision NOT NULL DEFAULT 0,
  semantic_score double precision NOT NULL DEFAULT 0,
  explanation jsonb NOT NULL,
  error_code varchar(120) NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_results_job_id ON match_results (job_id);
CREATE INDEX IF NOT EXISTS idx_match_results_candidate_id ON match_results (candidate_id);
CREATE INDEX IF NOT EXISTS idx_match_results_candidate_cv_id ON match_results (candidate_cv_id);
CREATE INDEX IF NOT EXISTS idx_match_results_application_id ON match_results (application_id);
