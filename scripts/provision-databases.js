#!/usr/bin/env node
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

dotenv.config();

const SERVICES = [
  ['auth-service', 'AUTH_SERVICE', 'auth_service'],
  ['candidate-service', 'CANDIDATE_SERVICE', 'candidate_service'],
  ['company-service', 'COMPANY_SERVICE', 'company_service'],
  ['job-service', 'JOB_SERVICE', 'job_service'],
  ['application-service', 'APPLICATION_SERVICE', 'application_service'],
  ['cv-parsing-service', 'CV_PARSING_SERVICE', 'cv_parsing_service'],
  ['matching-service', 'MATCHING_SERVICE', 'matching_service'],
  ['notification-service', 'NOTIFICATION_SERVICE', 'notification_service'],
  ['document-storage-service', 'DOCUMENT_STORAGE_SERVICE', 'document_storage_service'],
];

const container = process.env.POSTGRES_CONTAINER ?? 'nexhire-postgres';
const adminUser = process.env.POSTGRES_USER ?? 'postgres';

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function psql(database, sql, options = {}) {
  const args = [
    'exec',
    container,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    adminUser,
    '-d',
    database,
  ];

  if (options.capture) {
    args.push('-t', '-A');
  }

  args.push('-c', sql);

  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });

  if (result.status !== 0) {
    if (options.capture && result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? '';
}

function databaseExists(database) {
  const output = psql(
    'postgres',
    `SELECT 1 FROM pg_database WHERE datname = ${quoteLiteral(database)}`,
    { capture: true },
  );

  return output.trim() === '1';
}

function ensureRole(role, password) {
  psql(
    'postgres',
    `
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ${quoteLiteral(role)}) THEN
    CREATE ROLE ${quoteIdent(role)} LOGIN PASSWORD ${quoteLiteral(password)};
  END IF;
END $$;
ALTER ROLE ${quoteIdent(role)} WITH LOGIN PASSWORD ${quoteLiteral(password)};
`.trim(),
  );
}

function ensureDatabase(database, role) {
  if (!databaseExists(database)) {
    psql('postgres', `CREATE DATABASE ${quoteIdent(database)} OWNER ${quoteIdent(role)}`);
  }

  psql('postgres', `ALTER DATABASE ${quoteIdent(database)} OWNER TO ${quoteIdent(role)}`);
}

function ensureSchema(database, role) {
  psql(
    database,
    `
ALTER SCHEMA public OWNER TO ${quoteIdent(role)};
GRANT USAGE, CREATE ON SCHEMA public TO ${quoteIdent(role)};
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
`.trim(),
  );
}

for (const [service, prefix, fallback] of SERVICES) {
  const database = process.env[`${prefix}_DB_NAME`] ?? `${fallback}_db`;
  const role = process.env[`${prefix}_DB_USER`] ?? `${fallback}_user`;
  const password = process.env[`${prefix}_DB_PASS`] ?? `${fallback}_pass`;

  console.log(`------------ provisioning: ${service} ------------`);
  ensureRole(role, password);
  ensureDatabase(database, role);
  ensureSchema(database, role);
}

console.log('database provisioning done');
