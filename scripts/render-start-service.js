#!/usr/bin/env node
const { spawnSync } = require('child_process');

const [, , service, entrypoint] = process.argv;

if (!service || !entrypoint) {
  console.error('usage: node scripts/render-start-service.js <service> <entrypoint>');
  process.exit(1);
}

function run(label, command, args) {
  console.log(`------------ ${label} ------------`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function envKeyForService(name) {
  return name.replace(/-/g, '_').toUpperCase();
}

function seedAliases() {
  const serviceKey = envKeyForService(service);
  const raw = process.env[`${serviceKey}_POST_MIGRATE_SEEDS`] ?? process.env.POST_MIGRATE_SEEDS ?? '';

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

run(`migrating ${service}`, process.execPath, ['scripts/migration.js', 'run', service]);

for (const seedAlias of seedAliases()) {
  run(`seeding ${seedAlias}`, process.execPath, ['scripts/seed.js', seedAlias]);
}

run(`starting ${service}`, process.execPath, [entrypoint]);
