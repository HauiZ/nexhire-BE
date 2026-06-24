-- Create one schema per service (idempotent).
-- Run via: make migrate-schema
CREATE SCHEMA IF NOT EXISTS auth_schema;
CREATE SCHEMA IF NOT EXISTS job_schema;
CREATE SCHEMA IF NOT EXISTS cvapp_schema;
CREATE SCHEMA IF NOT EXISTS ai_schema;
