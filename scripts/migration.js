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
  'document-storage-service',
]);

const [, , command, service, name] = process.argv;

function usage() {
  console.error(
    'usage: node scripts/migration.js <generate|create|run|revert|show> <service> [Name]',
  );
  console.error(
    '       service: auth-service | candidate-service | company-service | job-service | application-service | cv-parsing-service | matching-service | document-storage-service',
  );
  process.exit(1);
}

if (!command || !service || !VALID_SERVICES.has(service)) {
  usage();
}

if ((command === 'generate' || command === 'create') && !name) {
  usage();
}

const typeormCli = path.join('.', 'node_modules', 'typeorm', 'cli.js');
const dataSource = path.join('apps', service, 'data-source.ts');
const output = name ? path.join('apps', service, 'src', 'migrations', name) : undefined;

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
