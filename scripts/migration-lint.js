#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SERVICES = [
  'auth-service',
  'candidate-service',
  'company-service',
  'job-service',
  'application-service',
  'cv-parsing-service',
  'matching-service',
  'document-storage-service',
];

const requestedServices = process.argv.slice(2);
const services = requestedServices.length ? requestedServices : SERVICES;
const invalid = services.filter((service) => !SERVICES.includes(service));

if (invalid.length > 0) {
  console.error(`Unknown service(s): ${invalid.join(', ')}`);
  console.error(`Valid services: ${SERVICES.join(', ')}`);
  process.exit(1);
}

const findings = [];

function addFinding(file, message) {
  findings.push({ file, message });
}

function listMigrationFiles(service) {
  const dir = path.join(process.cwd(), 'apps', service, 'src', 'migrations');
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => path.join(dir, file));
}

function lintMigration(file) {
  const text = fs.readFileSync(file, 'utf8');
  const displayPath = path.relative(process.cwd(), file);
  const lines = text.split(/\r?\n/);
  const upBodyMatch = text.match(
    /public\s+async\s+up\s*\([^)]*\)\s*:\s*Promise<void>\s*{([\s\S]*?)\n\s*}\s*\n\s*public\s+async\s+down/m,
  );
  const upText = upBodyMatch?.[1] ?? text;

  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) {
      addFinding(displayPath, `line ${index + 1}: trailing whitespace`);
    }
  });

  if (
    /uuid_generate_v4\s*\(/i.test(text) &&
    !/CREATE EXTENSION IF NOT EXISTS\s+["'`]uuid-ossp["'`]/i.test(text)
  ) {
    addFinding(
      displayPath,
      'uses uuid_generate_v4() without creating the uuid-ossp extension; prefer pgcrypto + gen_random_uuid()',
    );
  }

  if (
    /gen_random_uuid\s*\(/i.test(text) &&
    !/CREATE EXTENSION IF NOT EXISTS\s+["'`]pgcrypto["'`]/i.test(text)
  ) {
    addFinding(
      displayPath,
      'uses gen_random_uuid() without CREATE EXTENSION IF NOT EXISTS "pgcrypto"',
    );
  }

  const riskyPatterns = [
    [/DROP TABLE/i, 'contains DROP TABLE; verify this is intentional'],
    [
      /DROP COLUMN/i,
      'contains DROP COLUMN; use rename/backfill if this is a rename or data must be preserved',
    ],
    [/DROP TYPE/i, 'contains DROP TYPE; verify enum changes are intentional and ordered safely'],
    [/DROP INDEX/i, 'contains DROP INDEX; verify index removal is intentional'],
  ];

  for (const [pattern, message] of riskyPatterns) {
    if (pattern.test(upText)) {
      addFinding(displayPath, message);
    }
  }

  if (/CONSTRAINT\s+"PK_[a-f0-9]{16,}"/i.test(text)) {
    addFinding(
      displayPath,
      'contains a generated hash primary-key constraint name; prefer stable names such as pk_<table>_id',
    );
  }

  if (/ALTER TABLE[\s\S]+DROP CONSTRAINT[\s\S]+ADD CONSTRAINT/i.test(upText)) {
    addFinding(displayPath, 'drops and re-adds constraints; check for noisy FK/default churn');
  }
}

for (const service of services) {
  for (const file of listMigrationFiles(service)) {
    lintMigration(file);
  }
}

if (findings.length > 0) {
  console.error('Migration lint found issues:');
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.message}`);
  }
  if (requestedServices.length === 0) {
    console.error('');
    console.error(
      'Tip: pass service names to lint only touched services, for example: npm run db:migration:lint -- company-service',
    );
  }
  process.exit(1);
}

console.log(`Migration lint passed for ${services.join(', ')}.`);
