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
const scriptFileName = path.basename(absoluteScriptPath);
const runId = process.env.TEST_FLOW_RUN_ID ?? String(Date.now());
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

const childEnv = {
  ...process.env,
  TEST_FLOW_RUN_ID: runId,
};

const result = spawnSync(command, args, { stdio: 'inherit', env: childEnv });

function cleanupDisabledByEnv() {
  if (process.env.TEST_FLOW_CLEANUP_AFTER_RUN === 'false') {
    return true;
  }

  if (process.env.TEST_FLOW_KEEP_DATA === 'true') {
    return true;
  }

  const keepDataEnvByScript = new Map([
    ['test-application-api.ts', 'APPLICATION_TEST_KEEP_DATA'],
    ['test-auth-api.ts', 'AUTH_TEST_KEEP_DATA'],
    ['test-candidate-api.ts', 'CANDIDATE_TEST_KEEP_DATA'],
    ['test-company-job-moderation-api.ts', 'COMPANY_JOB_FLOW_KEEP_DATA'],
    ['test-document-storage-api.ts', 'DOCUMENT_STORAGE_TEST_KEEP_DATA'],
  ]);
  const keepDataEnv = keepDataEnvByScript.get(scriptFileName);

  return keepDataEnv ? process.env[keepDataEnv] === 'true' : false;
}

function shouldRunCleanupAfterFlow() {
  if (cleanupDisabledByEnv()) {
    return false;
  }

  if (!scriptFileName.startsWith('test-')) {
    return false;
  }

  return !new Set(['test-cleanup-data.ts', 'test-project-preflight.ts']).has(scriptFileName);
}

let exitCode = result.status ?? 1;

if (shouldRunCleanupAfterFlow()) {
  const cleanupScript = path.join(testFlowsRoot, 'test-cleanup-data.ts');
  if (existsSync(cleanupScript)) {
    console.log('');
    console.log('Running post-flow DB cleanup for generated test data...');
    const cleanupResult = spawnSync(
      process.execPath,
      ['-r', 'ts-node/register', cleanupScript],
      {
        stdio: 'inherit',
        env: {
          ...childEnv,
          TEST_FLOW_CLEANUP_APPLY: 'true',
          TEST_FLOW_CLEANUP_RUN_ID: runId,
        },
      },
    );

    const cleanupExitCode = cleanupResult.status ?? 1;
    if (cleanupExitCode !== 0) {
      console.error(`Post-flow cleanup failed with exit code ${cleanupExitCode}.`);
      if (exitCode === 0) {
        exitCode = cleanupExitCode;
      }
    }
  }
}

process.exit(exitCode);
