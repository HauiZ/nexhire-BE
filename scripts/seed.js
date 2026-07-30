#!/usr/bin/env node
require('ts-node/register');
require('tsconfig-paths/register');

const fs = require('fs');
const path = require('path');

const command = process.argv[2];
const exportName = process.argv[3];

const SEED_SEARCH_ROOTS = [
  path.resolve(process.cwd(), 'apps'),
  path.resolve(process.cwd(), 'scripts', 'seeds'),
];

const LEGACY_ALIASES = {
  'auth-roles': 'auth-role',
};

async function main() {
  if (!command || command === 'list') {
    printAvailableSeeds();
    return;
  }

  if (looksLikeSeedPath(command)) {
    await runSeedFile(path.resolve(process.cwd(), command), exportName);
    return;
  }

  const alias = LEGACY_ALIASES[command] ?? command;
  const seedFile = discoverSeedFiles().get(alias);
  if (!seedFile) {
    console.error(`unknown seed: ${command}`);
    printAvailableSeeds();
    process.exit(1);
  }

  await runSeedFile(seedFile, exportName);
}

async function runSeedFile(seedPath, requestedExportName) {
  const seedModule = require(seedPath);
  const seedFn = resolveSeedFunction(seedModule, requestedExportName);
  await seedFn();
  console.log(`seed completed: ${path.relative(process.cwd(), seedPath)}`);
}

function discoverSeedFiles() {
  const seeds = new Map();
  for (const root of SEED_SEARCH_ROOTS) {
    for (const seedPath of walkSeedFiles(root)) {
      const alias = path.basename(seedPath).replace(/\.seed\.(ts|js)$/, '');
      seeds.set(alias, seedPath);
    }
  }
  return seeds;
}

function walkSeedFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSeedFiles(fullPath));
      continue;
    }

    if (/\.seed\.(ts|js)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function looksLikeSeedPath(value) {
  return (
    value.endsWith('.ts') || value.endsWith('.js') || value.includes('/') || value.includes('\\')
  );
}

function resolveSeedFunction(seedModule, requestedExportName) {
  const seedFn =
    (requestedExportName && seedModule[requestedExportName]) ||
    seedModule.seed ||
    seedModule.default ||
    seedModule.main;

  if (typeof seedFn !== 'function') {
    throw new Error('Seed file must export a seed(), default(), or main() function');
  }

  return seedFn;
}

function printAvailableSeeds() {
  const seeds = [...discoverSeedFiles().keys()].sort();
  console.log('usage: npm run seed -- <seed-alias>');
  console.log('usage: npm run seed -- <path-to-seed-file> [exportName]');
  console.log('');
  console.log('available seeds:');
  for (const seed of seeds) {
    console.log(`  - ${seed}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
