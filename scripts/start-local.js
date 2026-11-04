// Run existing startup scripts with .env.local inherited by Node and Python.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const targets = args.filter((arg) => arg !== '--check');
const target = targets[0] || 'start:all';
const scripts = require('../package.json').scripts;

if (targets.length > 1 || !target.startsWith('start:') || target === 'start:local' || !scripts[target]) {
  console.error('Usage: npm run start:local -- [start:all|start:<service>] [--check]');
  process.exit(1);
}

const envFile = path.join(root, '.env.local');
if (!fs.existsSync(envFile)) {
  console.error('Missing .env.local in the repository root.');
  process.exit(1);
}
const env = { ...process.env };
const loaded = dotenv.config({ path: envFile, processEnv: env, override: true });
if (loaded.error) {
  console.error('Could not read .env.local.');
  process.exit(1);
}

console.log(`[local] Loaded .env.local; target: ${target}.`);
if (checkOnly) process.exit(0);

// npm supplies its JS entrypoint; invoking Node avoids Windows npm.cmd quoting.
if (!process.env.npm_execpath || !fs.existsSync(process.env.npm_execpath)) {
  console.error('Run this launcher through npm run start:local.');
  process.exit(1);
}
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', target], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: false,
});
if (result.error) console.error(`Startup failed: ${result.error.code || 'unknown error'}`);
process.exit(result.status ?? 1);
