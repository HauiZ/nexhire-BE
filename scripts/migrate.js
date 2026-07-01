#!/usr/bin/env node
const { spawnSync } = require('child_process');

const services = [
  'auth-service',
  'candidate-service',
  'company-service',
  'job-service',
  'application-service',
  'cv-parsing-service',
  'matching-service',
  'document-storage-service',
];

for (const service of services) {
  console.log(`------------ migrating: ${service} ------------`);
  const result = spawnSync(process.execPath, ['scripts/migration.js', 'run', service], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('all migrations done');
