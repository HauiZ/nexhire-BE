import { spawnSync } from 'child_process';

export const MIGRATED_SERVICES = [
  'auth-service',
  'candidate-service',
  'company-service',
  'job-service',
  'application-service',
  'cv-parsing-service',
  'matching-service',
  'notification-service',
  'document-storage-service',
] as const;

export type MigratedService = (typeof MIGRATED_SERVICES)[number];

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

export interface MigrationCheckResult {
  service: MigratedService;
  ok: boolean;
  pending: string[];
  output: string;
  errorOutput: string;
}

export function checkMigrations(service: MigratedService): MigrationCheckResult {
  const result = spawnSync(process.execPath, ['scripts/migration.js', 'show', service], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const output = result.stdout ?? '';
  const errorOutput = result.stderr ?? '';
  const pending = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('[ ]'))
    .map((line) => line.replace('[ ]', '').trim())
    .filter(Boolean);

  return {
    service,
    ok: result.status === 0 && pending.length === 0,
    pending,
    output,
    errorOutput,
  };
}

export function assertMigrationsApplied(services: MigratedService[]): boolean {
  log('Preflight: checking database migrations', 'cyan');
  const results = services.map((service) => checkMigrations(service));
  let ok = true;

  for (const result of results) {
    if (result.ok) {
      log(`OK ${result.service} migrations applied`, 'green');
      continue;
    }

    ok = false;
    if (result.pending.length > 0) {
      log(`FAIL ${result.service} has pending migrations`, 'red');
      for (const migration of result.pending) {
        log(`- ${migration}`, 'yellow');
      }
      log(`Run: npm run db:${serviceShortName(result.service)}:run`, 'dim');
      continue;
    }

    log(`FAIL ${result.service} migration check failed`, 'red');
    if (result.output.trim()) {
      log(result.output.trim(), 'yellow');
    }
    if (result.errorOutput.trim()) {
      log(result.errorOutput.trim(), 'yellow');
    }
  }

  return ok;
}

function serviceShortName(service: MigratedService): string {
  return service.replace('-service', '');
}
