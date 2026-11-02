// Real socket checks through gateway -> application -> matching. No DB writes.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Client } = require('pg');
const { JwtService } = require('@nestjs/jwt');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const env = { ...process.env, ...require('dotenv').parse(fs.readFileSync(path.join(root, '.env.local'))) };
const children = [];
const checks = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
const output = path.join(root, 'trainning/_maintenance/ai2-e2e');
fs.mkdirSync(output, { recursive: true });
function start(command, args, extra = {}) {
  const child = spawn(command, args, { cwd: root, env: { ...env, ...extra }, stdio: 'ignore', windowsHide: true });
  children.push(child);
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise(r => child.once('exit', r)), delay(3000)]);
  assert.ok(child.exitCode !== null || child.signalCode !== null, 'Owned process did not stop');
}
async function ready(port) {
  for (let i = 0; i < 120; i++) {
    try { await fetch(`http://127.0.0.1:${port}/api/v1/health`); return; } catch {}
    await delay(250);
  }
  throw new Error(`Service ${port} did not become ready`);
}
async function db(prefix, query, params = []) {
  const c = new Client({ host: env.DB_HOST, port: +env.DB_PORT, user: env[prefix + '_DB_USER'], password: env[prefix + '_DB_PASS'], database: env[prefix + '_DB_NAME'] });
  await c.connect();
  try { await c.query('BEGIN READ ONLY'); return (await c.query(query, params)).rows; }
  finally { await c.query('ROLLBACK'); await c.end(); }
}
async function main() {
  // Refuse occupied ports rather than driving or stopping someone else's server.
  for (const port of [13000, 13005, 13007, 15173]) {
    const occupied = await new Promise(resolve => {
      const socket = require('node:net').connect(port, '127.0.0.1');
      socket.setTimeout(1000);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
      socket.once('timeout', () => { socket.destroy(); resolve(true); });
    });
    assert.equal(occupied, false, `E2E port ${port} is occupied; refusing to touch existing service`);
  }
  const [fixture] = await db('APPLICATION_SERVICE', "select id,job_id,company_id,candidate_id,candidate_user_id,candidate_cv_id from applications where job_title='Junior Backend Developer — Local AI1 Test' and deleted_at is null limit 1");
  assert.ok(fixture, 'Existing synthetic Local AI1 fixture required');
  const before = await db('MATCHING_SERVICE', "select id,md5(row_to_json(m)::text) digest from match_results m order by id");
  const jwt = new JwtService({ secret: env.JWT_ACCESS_SECRET });
  const recruiter = jwt.sign({ sub: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'RECRUITER', companyId: fixture.company_id }, { expiresIn: '10m' });
  const foreign = jwt.sign({ sub: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'RECRUITER', companyId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }, { expiresIn: '10m' });
  const candidate = jwt.sign({ sub: fixture.candidate_user_id, role: 'CANDIDATE' }, { expiresIn: '10m' });
  // Queue names are isolated so startup cannot consume historical application events.
  const suffix = `ai2-e2e-${Date.now()}`;
  start(process.execPath, ['dist/apps/application-service/main.js'], {
    APPLICATION_SERVICE_PORT: '13005', MATCHING_SERVICE_URL: 'http://127.0.0.1:13007',
    APPLICATION_SERVICE_JOB_LIFECYCLE_QUEUE: `${suffix}-job`,
    APPLICATION_SERVICE_MATCHING_COMPLETED_QUEUE: `${suffix}-match`,
    APPLICATION_SERVICE_CV_PARSED_QUEUE: `${suffix}-cv`,
  });
  start(process.execPath, ['dist/apps/gateway/main.js'], {
    GATEWAY_PORT: '13000', APPLICATION_SERVICE_URL: 'http://127.0.0.1:13005',
    FRONTEND_URL: 'http://127.0.0.1:15173',
  });
  const matchingEnv = { PYTHONPATH: `${path.join(root, 'apps/matching-service')}${path.delimiter}${path.join(root, 'scripts')}`, NODE_ENV: 'development', MATCHING_AI2_DEMO_ENABLED: 'false' };
  const python = path.join(root, 'apps/matching-service/.venv/Scripts/python.exe');
  let matching = start(python, ['-m', 'uvicorn', 'ai2-e2e-matching:app', '--host', '127.0.0.1', '--port', '13007', '--no-access-log'], matchingEnv);
  await Promise.all([ready(13000), ready(13005), ready(13007)]);
  const endpoint = `http://127.0.0.1:13000/api/v1/recruiter/applications/${fixture.id}/ai2-demo`;
  async function request(token) {
    const response = await fetch(endpoint, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const body = await response.json();
    return { status: response.status, body };
  }
  assert.equal((await request()).status, 401); checks.push('gateway unauthenticated 401');
  assert.equal((await request(candidate)).status, 403); checks.push('candidate role 403');
  assert.ok([403, 404].includes((await request(foreign)).status)); checks.push('foreign-company recruiter denied');
  const noInternal = await fetch(`http://127.0.0.1:13007/api/v1/matching/applications/${fixture.id}/latest-ai2-demo`);
  assert.equal(noInternal.status, 403); checks.push('matching missing internal token 403');
  const disabled = await request(recruiter);
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.data.status, 'DISABLED');
  assert.equal(disabled.body.data.score, null); checks.push('authorized default-off response through real gateway');
  await stop(matching);
  matching = start(python, ['-m', 'uvicorn', 'ai2-e2e-matching:app', '--host', '127.0.0.1', '--port', '13007', '--no-access-log'], {
    ...matchingEnv, MATCHING_AI2_DEMO_ENABLED: 'true', MATCHING_AI2_DEMO_ARTIFACT_PATH: path.join(root, 'trainning/ai2/demo-artifact-v1'),
  });
  await ready(13007);
  const coldStarted = performance.now();
  const enabled = await request(recruiter);
  const coldRequestMs = Math.round(performance.now() - coldStarted);
  console.log('First opt-in request duration (ms):', coldRequestMs);
  if (enabled.status !== 200) console.log('Opt-in sanitized response:', JSON.stringify(enabled.body));
  assert.equal(enabled.status, 200, 'Opt-in route must not fail');
  assert.ok(['READY', 'UNAVAILABLE'].includes(enabled.body.data.status));
  assert.equal(enabled.body.data.rankingPosition, null);
  assert.equal(enabled.body.data.automaticallyReject, false);
  checks.push(`opt-in stored fixture response ${enabled.body.data.status}`);
  if (enabled.body.data.status === 'READY') assert.ok(Number.isFinite(enabled.body.data.score));
  // Browser runner receives ephemeral JWT over stdin, never a file or CLI argument.
  for (const frontendEnabled of [false, true]) {
  const browser = spawn(process.execPath, [path.join(root, '../Nexthire-FE/tests/ai2/ai2-live-browser.mjs')], {
    cwd: path.join(root, '../Nexthire-FE'), env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  children.push(browser);
  browser.stdin.end(JSON.stringify({ token: recruiter, applicationId: fixture.id, jobId: fixture.job_id, expectedStatus: enabled.body.data.status, frontendEnabled, output }));
  let text = '';
  browser.stdout.on('data', d => { text += d; });
  browser.stderr.on('data', () => {});
  const code = await new Promise(r => browser.on('exit', r));
  assert.equal(code, 0, 'Browser runner failed (no credentials logged)');
  checks.push(frontendEnabled ? 'real Chrome panel + live gateway requests' : 'default-off Chrome: panel absent, zero AI2 API requests');
  }
  const after = await db('MATCHING_SERVICE', "select id,md5(row_to_json(m)::text) digest from match_results m order by id");
  assert.deepEqual(after, before); checks.push('all persisted matching results unchanged');
  const receipt = { date: '2026-10-29', success: true, checks, coldRequestMs, storedFixtureStatus: enabled.body.data.status,
    limitations: ['JWT local test identity, not login UI', 'HTTP-only production matching router, no worker', 'No new synthetic READY result inserted; existing saved fixture used', 'Dedicated frontend panel harness, not full recruiter page'] };
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
}
main().catch(error => { console.error('E2E failed:', error.message); process.exitCode = 1; })
  .finally(async () => { for (const child of children.reverse()) await stop(child).catch(() => {}); });
