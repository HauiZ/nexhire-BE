#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const VALID_SERVICES = new Set([
  'auth-service',
  'candidate-service',
  'company-service',
  'job-service',
  'application-service',
  'cv-parsing-service',
  'matching-service',
  'notification-service',
  'document-storage-service',
]);

const [, , command, service, ...nameParts] = process.argv;

function usage() {
  console.error(
    'usage: node scripts/migration.js <generate|create|run|revert|show> <service> [Name]',
  );
  console.error(
    '       service: auth-service | candidate-service | company-service | job-service | application-service | cv-parsing-service | matching-service | notification-service | document-storage-service',
  );
  process.exit(1);
}

if (!command || !service || !VALID_SERVICES.has(service)) {
  usage();
}

function toPascalCase(value) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('');
}

function defaultMigrationName(serviceName, migrationCommand) {
  const serviceNamePascal = toPascalCase(serviceName);
  return migrationCommand === 'generate'
    ? `${serviceNamePascal}SchemaUpdate`
    : `${serviceNamePascal}ManualMigration`;
}

const rawName = nameParts.join(' ').trim();
const normalizedName = rawName ? toPascalCase(rawName) : undefined;
const migrationName =
  command === 'generate' || command === 'create'
    ? normalizedName ?? defaultMigrationName(service, command)
    : undefined;

if ((command === 'generate' || command === 'create') && !normalizedName) {
  console.log(`No migration name provided; using ${migrationName}.`);
}

const typeormCli = path.join('.', 'node_modules', 'typeorm', 'cli.js');
const dataSource = path.join('apps', service, 'data-source.ts');
const output = migrationName
  ? path.join('apps', service, 'src', 'migrations', migrationName)
  : undefined;

const args = [
  '--require',
  'ts-node/register',
  '--require',
  'tsconfig-paths/register',
  typeormCli,
];

switch (command) {
  case 'generate':
    args.push('migration:generate', output, '-d', dataSource);
    break;
  case 'create':
    args.push('migration:create', output);
    break;
  case 'run':
    args.push('migration:run', '-d', dataSource);
    break;
  case 'revert':
    args.push('migration:revert', '-d', dataSource);
    break;
  case 'show':
    args.push('migration:show', '-d', dataSource);
    break;
  default:
    usage();
}

const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
