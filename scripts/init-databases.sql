-- DB-per-service bootstrap: one database + one dedicated user per service.
-- Runs automatically on a fresh Postgres volume (docker-entrypoint-initdb.d).
-- Idempotent so it can also be re-applied manually (make migrate-db).
-- NOTE: dev credentials only — production uses real secrets.

-- ── auth ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'auth_user') THEN
    CREATE ROLE auth_user LOGIN PASSWORD 'auth_pass';
  END IF;
END $$;
SELECT 'CREATE DATABASE auth_db OWNER auth_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auth_db')\gexec

-- ── job ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'job_user') THEN
    CREATE ROLE job_user LOGIN PASSWORD 'job_pass';
  END IF;
END $$;
SELECT 'CREATE DATABASE job_db OWNER job_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'job_db')\gexec

-- ── cv-app ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cvapp_user') THEN
    CREATE ROLE cvapp_user LOGIN PASSWORD 'cvapp_pass';
  END IF;
END $$;
SELECT 'CREATE DATABASE cvapp_db OWNER cvapp_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cvapp_db')\gexec

-- ── ai ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ai_user') THEN
    CREATE ROLE ai_user LOGIN PASSWORD 'ai_pass';
  END IF;
END $$;
SELECT 'CREATE DATABASE ai_db OWNER ai_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ai_db')\gexec
