#!/usr/bin/env node
const { spawnSync } = require('child_process');

const name = process.argv.slice(2).join(' ').trim();
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

let generatedCount = 0;

for (const service of services) {
  console.log(`------------ ${service} ------------`);
  const result = spawnSync(
    process.execPath,
    [
      'scripts/migration.js',
      'generate',
      service,
      ...(name ? [name] : []),
    ],
    { encoding: 'utf8' },
  );

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (/No changes in database schema/i.test(output)) {
    console.log('  no entity changes - skipped');
    continue;
  }

  if (result.status === 0) {
    const successLine = output
      .split(/\r?\n/)
      .find((line) => /has been generated successfully/i.test(line));
    console.log(successLine ?? '  generated');
    generatedCount += 1;
    continue;
  }

  console.error('  failed:');
  const tail = output.split(/\r?\n/).filter(Boolean).slice(-5);
  for (const line of tail) {
    console.error(line);
  }
  console.error('');
  console.error('Hint: is the database running and migrated up to date?');
  process.exit(result.status ?? 1);
}

console.log('');
console.log(`generated migration(s) for ${generatedCount} service(s). Review them before db:all:run.`);
