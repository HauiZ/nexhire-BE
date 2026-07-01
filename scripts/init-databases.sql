-- DB-per-service bootstrap: one database + one dedicated user per service.
-- Runs automatically on a fresh Postgres volume (docker-entrypoint-initdb.d).
-- Idempotent so it can also be re-applied manually (make migrate-db).
-- NOTE: dev credentials only - production uses real secrets.

-- auth-service
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'auth_service_user') THEN
    CREATE ROLE auth_service_user LOGIN PASSWORD 'auth_service_pass';
  END IF;
END $$;
SELECT 'CREATE DATABASE auth_service_db OWNER auth_service_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auth_service_db')\gexec

-- candidate-service
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'candidate_service_user') THEN
    CREATE ROLE candidate_service_user LOGIN PASSWORD 'candidate_service_pass';
  END IF;
END $$;
SELECT 'CREATE DATABASE candidate_service_db OWNER candidate_service_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'candidate_service_db')\gexec

-- company-service
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'company_service_user') THEN
    CREATE ROLE company_service_user LOGIN PASSWORD 'company_service_pass';
  END IF;
END $$;
SELECT 'CREATE DATABASE company_service_db OWNER company_service_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'company_service_db')\gexec

-- job-service
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'job_service_user') THEN
    CREATE ROLE job_service_user LOGIN PASSWORD 'job_service_pass';
  END IF;
END $$;
SELECT 'CREATE DATABASE job_service_db OWNER job_service_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'job_service_db')\gexec

-- application-service
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'application_service_user') THEN
    CREATE ROLE application_service_user LOGIN PASSWORD 'application_service_pass';
  END IF;
END $$;
SELECT 'CREATE DATABASE application_service_db OWNER application_service_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'application_service_db')\gexec

-- cv-parsing-service
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cv_parsing_service_user') THEN
    CREATE ROLE cv_parsing_service_user LOGIN PASSWORD 'cv_parsing_service_pass';
  END IF;
END $$;
SELECT 'CREATE DATABASE cv_parsing_service_db OWNER cv_parsing_service_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cv_parsing_service_db')\gexec

-- matching-service
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'matching_service_user') THEN
    CREATE ROLE matching_service_user LOGIN PASSWORD 'matching_service_pass';
  END IF;
END $$;
SELECT 'CREATE DATABASE matching_service_db OWNER matching_service_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'matching_service_db')\gexec

-- document-storage-service
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'document_storage_service_user') THEN
    CREATE ROLE document_storage_service_user LOGIN PASSWORD 'document_storage_service_pass';
  END IF;
END $$;
SELECT 'CREATE DATABASE document_storage_service_db OWNER document_storage_service_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'document_storage_service_db')\gexec
