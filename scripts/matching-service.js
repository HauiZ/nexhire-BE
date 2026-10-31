const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');

const root = process.cwd();
dotenv.config({ path: path.join(root, '.env'), override: false });
dotenv.config({ path: path.join(root, '.env.local'), override: true });

const command = process.argv[2];
const serviceDir = path.join(root, 'apps', 'matching-service');
const venvDir = path.join(serviceDir, '.venv');
const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
const venvPython = path.join(venvDir, binDir, process.platform === 'win32' ? 'python.exe' : 'python');
const venvUvicorn = path.join(venvDir, binDir, process.platform === 'win32' ? 'uvicorn.exe' : 'uvicorn');

const python = fs.existsSync(venvPython) ? venvPython : 'python';
const uvicorn = fs.existsSync(venvUvicorn) ? venvUvicorn : 'uvicorn';

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  process.exit(result.status ?? 1);
}

if (command === 'venv') {
  run('python', ['-m', 'venv', path.relative(root, venvDir)]);
}

if (command === 'install') {
  run(python, ['-m', 'pip', 'install', '-r', path.join(serviceDir, 'requirements.txt')]);
}

if (command === 'migrate') {
  run(python, [path.join(serviceDir, 'app', 'migrate.py')], {
    env: { ...process.env, PYTHONPATH: serviceDir },
  });
}

if (command === 'test') {
  run(python, ['-m', 'unittest', 'discover', '-s', path.join(serviceDir, 'tests')], {
    env: { ...process.env, PYTHONPATH: serviceDir },
  });
}

if (command === 'start') {
  run(uvicorn, ['app.main:app', '--app-dir', serviceDir, '--reload',
    '--reload-dir', path.join(serviceDir, 'app'),
    '--host', '0.0.0.0', '--port', '3007']);
}

console.error('Usage: node scripts/matching-service.js <venv|install|migrate|test|start>');
process.exit(1);
