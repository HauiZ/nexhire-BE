#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');

const NEST_SERVICES = [
  ['auth-service', 'AUTH_SERVICE_PORT', 3001, 'dist/apps/auth-service/main.js'],
  ['candidate-service', 'CANDIDATE_SERVICE_PORT', 3002, 'dist/apps/candidate-service/main.js'],
  ['company-service', 'COMPANY_SERVICE_PORT', 3003, 'dist/apps/company-service/main.js'],
  ['job-service', 'JOB_SERVICE_PORT', 3004, 'dist/apps/job-service/main.js'],
  ['application-service', 'APPLICATION_SERVICE_PORT', 3005, 'dist/apps/application-service/main.js'],
  ['cv-parsing-service', 'CV_PARSING_SERVICE_PORT', 3006, 'dist/apps/cv-parsing-service/main.js'],
  ['notification-service', 'NOTIFICATION_SERVICE_PORT', 3008, 'dist/apps/notification-service/main.js'],
  [
    'document-storage-service',
    'DOCUMENT_STORAGE_SERVICE_PORT',
    3009,
    'dist/apps/document-storage-service/main.js',
  ],
];

const ALL_SERVICES = [
  ['gateway', 'GATEWAY_PORT', Number(process.env.PORT ?? 10000), 'dist/apps/gateway/main.js'],
  ...NEST_SERVICES,
];

const LOCAL_SERVICE_URLS = {
  AUTH_SERVICE_URL: ['AUTH_SERVICE_PORT', 3001],
  CANDIDATE_SERVICE_URL: ['CANDIDATE_SERVICE_PORT', 3002],
  COMPANY_SERVICE_URL: ['COMPANY_SERVICE_PORT', 3003],
  JOB_SERVICE_URL: ['JOB_SERVICE_PORT', 3004],
  APPLICATION_SERVICE_URL: ['APPLICATION_SERVICE_PORT', 3005],
  CV_PARSING_SERVICE_URL: ['CV_PARSING_SERVICE_PORT', 3006],
  MATCHING_SERVICE_URL: ['MATCHING_SERVICE_PORT', 3007],
  NOTIFICATION_SERVICE_URL: ['NOTIFICATION_SERVICE_PORT', 3008],
  DOCUMENT_STORAGE_SERVICE_URL: ['DOCUMENT_STORAGE_SERVICE_PORT', 3009],
};

const children = new Map();
let shuttingDown = false;

function defaultEnv() {
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  process.env.GATEWAY_PORT = process.env.GATEWAY_PORT || String(process.env.PORT || 10000);
  process.env.MATCHING_SERVICE_PORT = process.env.MATCHING_SERVICE_PORT || '3007';

  for (const [key, [portKey, fallbackPort]] of Object.entries(LOCAL_SERVICE_URLS)) {
    const current = process.env[key];
    if (!current || current.startsWith('__RENDER_')) {
      process.env[key] = `http://127.0.0.1:${process.env[portKey] || fallbackPort}`;
    }
  }
}

function run(label, command, args, options = {}) {
  console.log(`------------ ${label} ------------`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function migrate() {
  if (process.env.RUN_MIGRATIONS_ON_START !== 'true') {
    console.log('------------ migrations skipped ------------');
    console.log('Set RUN_MIGRATIONS_ON_START=true to run migrations before starting services.');
    return;
  }

  for (const [service] of NEST_SERVICES) {
    run(`migrating ${service}`, process.execPath, ['scripts/migration.js', 'run', service]);
  }

  run('migrating matching-service', 'python', ['-m', 'app.migrate'], {
    cwd: 'apps/matching-service',
  });
}

function seed() {
  if (process.env.RUN_SEEDS_ON_START !== 'true') {
    console.log('------------ seeds skipped ------------');
    console.log('Set RUN_SEEDS_ON_START=true and POST_MIGRATE_SEEDS to run startup seeds.');
    return;
  }

  const aliases = (process.env.POST_MIGRATE_SEEDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  for (const alias of aliases) {
    run(`seeding ${alias}`, process.execPath, ['scripts/seed.js', alias]);
  }
}

function prefixOutput(name, stream, output) {
  output.on('data', (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line) {
        stream.write(`[${name}] ${line}\n`);
      }
    }
  });
}

function startProcess(name, command, args, options = {}) {
  if (shuttingDown) {
    return;
  }

  const child = spawn(command, args, {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  children.set(name, { command, args, options, child });
  prefixOutput(name, process.stdout, child.stdout);
  prefixOutput(name, process.stderr, child.stderr);

  child.on('exit', (code, signal) => {
    children.delete(name);
    if (shuttingDown) {
      return;
    }

    console.error(`[${name}] exited code=${code} signal=${signal}; restarting in 5s`);
    setTimeout(() => startProcess(name, command, args, options), 5000);
  });
}

function startServices() {
  for (const [name, portKey, port, entrypoint] of ALL_SERVICES) {
    process.env[portKey] = process.env[portKey] || String(port);
    startProcess(name, process.execPath, [entrypoint]);
  }

  startProcess(
    'matching-service',
    'uvicorn',
    ['app.main:app', '--host', '0.0.0.0', '--port', process.env.MATCHING_SERVICE_PORT || '3007'],
    { cwd: 'apps/matching-service' },
  );
}

function shutdown(signal) {
  shuttingDown = true;
  console.log(`received ${signal}; stopping child services`);
  for (const { child } of children.values()) {
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

defaultEnv();
migrate();
seed();
startServices();
