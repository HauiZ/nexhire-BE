#!/usr/bin/env node
require('ts-node/register');
require('tsconfig-paths/register');

const service = process.argv[2];
const seedName = process.argv[3];

async function main() {
  if (service !== 'auth-service' || seedName !== 'auth-roles') {
    console.error('usage: node scripts/seed.js auth-service auth-roles');
    process.exit(1);
  }

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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
