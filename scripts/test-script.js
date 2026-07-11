#!/usr/bin/env node
const { existsSync } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const [, , scriptPath, ...scriptArgs] = process.argv;

function usage() {
  console.error('usage: npm run test:script <script-path> [...args]');
  console.error('example: npm run test:script test\\test-flows\\test-auth-api.ts');
  process.exit(1);
}

if (!scriptPath) {
  usage();
}

const absoluteScriptPath = path.resolve(process.cwd(), scriptPath);
const testFlowsRoot = path.resolve(process.cwd(), 'test', 'test-flows');

if (!absoluteScriptPath.startsWith(testFlowsRoot + path.sep)) {
  console.error('Error: test scripts must live under test/test-flows.');
  process.exit(1);
}

if (!existsSync(absoluteScriptPath)) {
  console.error(`Error: script not found: ${scriptPath}`);
  process.exit(1);
}

const extension = path.extname(absoluteScriptPath).toLowerCase();
let command;
let args;

switch (extension) {
  case '.ps1':
    command = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', absoluteScriptPath, ...scriptArgs];
    break;
  case '.ts':
    command = process.execPath;
    args = ['-r', 'ts-node/register', absoluteScriptPath, ...scriptArgs];
    break;
  case '.js':
    command = process.execPath;
    args = [absoluteScriptPath, ...scriptArgs];
    break;
  default:
    console.error(`Error: unsupported script extension: ${extension}`);
    process.exit(1);
}

const result = spawnSync(command, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
