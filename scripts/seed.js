#!/usr/bin/env node
require('ts-node/register');
require('tsconfig-paths/register');
const path = require('path');

const service = process.argv[2];
const seedName = process.argv[3];

async function main() {
  if (service && looksLikeSeedPath(service)) {
    const seedPath = path.resolve(process.cwd(), service);
    const seedModule = require(seedPath);
    const seedFn = resolveSeedFunction(seedModule, seedName);
    await seedFn();
    console.log(`seed completed: ${service}`);
    return;
  }

  if (service === 'auth-service' && seedName === 'auth-roles') {
    const dataSourceModule = require('../apps/auth-service/data-source.ts');
    const dataSource = dataSourceModule.default;
    const { seedAuthRoles } = require('../apps/auth-service/src/seeds/auth-role.seed.ts');

    await dataSource.initialize();
    try {
      await seedAuthRoles(dataSource);
      console.log('auth roles seeded');
    } finally {
      await dataSource.destroy();
    }
    return;
  }

  console.error('usage: node scripts/seed.js <path-to-seed-file> [exportName]');
  console.error('usage: node scripts/seed.js auth-service auth-roles');
  process.exit(1);
}

function looksLikeSeedPath(value) {
  return (
    value.endsWith('.ts') || value.endsWith('.js') || value.includes('/') || value.includes('\\')
  );
}

function resolveSeedFunction(seedModule, exportName) {
  const seedFn =
    (exportName && seedModule[exportName]) ||
    seedModule.seed ||
    seedModule.default ||
    seedModule.main;

  if (typeof seedFn !== 'function') {
    throw new Error('Seed file must export a seed(), default(), or main() function');
  }

  return seedFn;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
