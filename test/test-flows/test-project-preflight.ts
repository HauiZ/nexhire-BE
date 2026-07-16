import 'dotenv/config';
import { assertMigrationsApplied, MIGRATED_SERVICES } from './flow-preflight';

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

function checkEnv(name: string, required = false): boolean {
  if (process.env[name]) {
    log(`OK env ${name}`, 'green');
    return true;
  }
  log(`${required ? 'FAIL' : 'WARN'} env ${name} is missing`, required ? 'red' : 'yellow');
  return !required;
}

async function main(): Promise<void> {
  log('PROJECT TEST-FLOW PREFLIGHT', 'cyan');

  const envOk = [
    checkEnv('JWT_ACCESS_SECRET', true),
    checkEnv('INTERNAL_SERVICE_TOKEN', false),
    checkEnv('RABBITMQ_URL', false),
    checkEnv('REDIS_URL', false),
  ].every(Boolean);

  const migrationOk = assertMigrationsApplied([...MIGRATED_SERVICES]);

  if (!envOk || !migrationOk) {
    log('Preflight failed. Fix the items above before running live API flow scripts.', 'red');
    process.exit(1);
  }

  log('Preflight passed. Live API flow scripts can run against this local environment.', 'green');
}

main().catch((error) => {
  log(`Preflight fatal error: ${(error as Error).message}`, 'red');
  process.exit(1);
});
