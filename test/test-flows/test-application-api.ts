import 'dotenv/config';

const BASE_URL = process.env.APPLICATION_TEST_BASE_URL ?? 'http://localhost:3000/api/v1';
const JOB_ID = process.env.APPLICATION_TEST_JOB_ID;
const CANDIDATE_CV_ID = process.env.APPLICATION_TEST_CANDIDATE_CV_ID;
const CANDIDATE_TOKEN = process.env.APPLICATION_TEST_CANDIDATE_TOKEN;
const CANDIDATE_USER_ID = process.env.APPLICATION_TEST_CANDIDATE_USER_ID;
const RECRUITER_TOKEN = process.env.APPLICATION_TEST_RECRUITER_TOKEN;
const RECRUITER_USER_ID = process.env.APPLICATION_TEST_RECRUITER_USER_ID;
const RECRUITER_COMPANY_ID = process.env.APPLICATION_TEST_RECRUITER_COMPANY_ID;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

interface ApiEnvelope<T> {
  data?: T;
}

interface ApplicationResponse {
  id: string;
  jobId: string;
  candidateCvId: string;
  cvDocumentId: string;
  status: string;
  candidateAvatarUrl: string | null;
}

interface ApplicationCvDownloadResponse {
  documentId: string;
  url: string;
}

let passed = 0;
let failed = 0;

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title: string): void {
  console.log('\n' + '='.repeat(72));
  log(title, 'cyan');
  console.log('='.repeat(72));
}

function pass(message: string): void {
  passed++;
  log(`OK ${message}`, 'green');
}

function fail(message: string, data?: unknown): void {
  failed++;
  log(`FAIL ${message}`, 'red');
  if (data !== undefined) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function unwrap<T>(payload: ApiEnvelope<T> | T): T {
  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    (payload as ApiEnvelope<T>).data !== undefined
  ) {
    return (payload as ApiEnvelope<T>).data as T;
  }

  return payload as T;
}

function candidateHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (CANDIDATE_TOKEN) {
    headers.Authorization = `Bearer ${CANDIDATE_TOKEN}`;
    return headers;
  }

  if (CANDIDATE_USER_ID) {
    headers['x-user-id'] = CANDIDATE_USER_ID;
    headers['x-user-role'] = 'CANDIDATE';
  }

  return headers;
}

function recruiterHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (RECRUITER_TOKEN) {
    headers.Authorization = `Bearer ${RECRUITER_TOKEN}`;
    return headers;
  }

  if (RECRUITER_USER_ID && RECRUITER_COMPANY_ID) {
    headers['x-user-id'] = RECRUITER_USER_ID;
    headers['x-user-role'] = 'RECRUITER';
    headers['x-company-id'] = RECRUITER_COMPANY_ID;
  }

  return headers;
}

async function request<T>(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: T; raw: unknown }> {
  const url = `${BASE_URL}${path}`;
  log(`${method} ${url}`, 'blue');

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const raw = text ? JSON.parse(text) : {};

  return {
    status: response.status,
    data: unwrap<T>(raw),
    raw,
  };
}

function expectStatus(actual: number, expected: number, label: string, data?: unknown): boolean {
  if (actual === expected) {
    pass(`${label} -> ${expected}`);
    return true;
  }

  fail(`${label}: expected ${expected}, got ${actual}`, data);
  return false;
}

function requireEnv(): void {
  const missing = [
    ['APPLICATION_TEST_JOB_ID', JOB_ID],
    ['APPLICATION_TEST_CANDIDATE_CV_ID', CANDIDATE_CV_ID],
  ].filter(([, value]) => !value);

  if (!CANDIDATE_TOKEN && !CANDIDATE_USER_ID) {
    missing.push(['APPLICATION_TEST_CANDIDATE_TOKEN or APPLICATION_TEST_CANDIDATE_USER_ID', '']);
  }

  if (missing.length > 0) {
    log('Missing required env:', 'red');
    for (const [name] of missing) {
      log(`- ${name}`, 'red');
    }
    process.exit(1);
  }
}

async function createApplication(): Promise<ApplicationResponse | null> {
  logSection('1. Apply to published job');
  const response = await request<ApplicationResponse>('POST', '/applications', candidateHeaders(), {
    jobId: JOB_ID,
    candidateCvId: CANDIDATE_CV_ID,
    coverLetter: 'Application flow test cover letter.',
  });

  if (!expectStatus(response.status, 201, 'apply job', response.raw)) {
    return null;
  }

  if (
    response.data.id &&
    response.data.jobId === JOB_ID &&
    response.data.candidateCvId === CANDIDATE_CV_ID &&
    response.data.status === 'SUBMITTED'
  ) {
    pass('application snapshot is returned');
    return response.data;
  }

  fail('application response shape is invalid', response.raw);
  return null;
}

async function rejectDuplicateActiveApplication(): Promise<void> {
  logSection('2. Reject duplicate active application');
  const response = await request<unknown>('POST', '/applications', candidateHeaders(), {
    jobId: JOB_ID,
    candidateCvId: CANDIDATE_CV_ID,
  });

  expectStatus(response.status, 409, 'duplicate active application rejected', response.raw);
}

async function listAndDetail(applicationId: string): Promise<void> {
  logSection('3. Candidate list/detail');
  const listResponse = await request<unknown>('GET', '/applications/me', candidateHeaders());
  expectStatus(listResponse.status, 200, 'list my applications', listResponse.raw);

  const detailResponse = await request<ApplicationResponse>(
    'GET',
    `/applications/me/${applicationId}`,
    candidateHeaders(),
  );

  if (!expectStatus(detailResponse.status, 200, 'get my application detail', detailResponse.raw)) {
    return;
  }

  if (detailResponse.data.id === applicationId) {
    pass('candidate can read own application detail');
  } else {
    fail('candidate detail points to unexpected application', detailResponse.raw);
  }
}

async function getCandidateCv(application: ApplicationResponse): Promise<void> {
  logSection('4. Candidate CV download URL');
  const response = await request<ApplicationCvDownloadResponse>(
    'GET',
    `/applications/me/${application.id}/cv`,
    candidateHeaders(),
  );

  if (!expectStatus(response.status, 200, 'get application CV URL', response.raw)) {
    return;
  }

  if (response.data.documentId === application.cvDocumentId && response.data.url) {
    pass('candidate receives short-lived CV URL');
  } else {
    fail('CV download response is invalid', response.raw);
  }
}

async function recruiterChecks(applicationId: string): Promise<void> {
  if (!RECRUITER_TOKEN && (!RECRUITER_USER_ID || !RECRUITER_COMPANY_ID)) {
    logSection('5. Recruiter checks');
    log('Skipped: set APPLICATION_TEST_RECRUITER_TOKEN or recruiter user/company headers.', 'yellow');
    return;
  }

  logSection('5. Recruiter list/detail/status');
  const listResponse = await request<unknown>(
    'GET',
    `/recruiter/applications?jobId=${JOB_ID}`,
    recruiterHeaders(),
  );
  expectStatus(listResponse.status, 200, 'recruiter list applications', listResponse.raw);

  const detailResponse = await request<ApplicationResponse>(
    'GET',
    `/recruiter/applications/${applicationId}`,
    recruiterHeaders(),
  );
  expectStatus(detailResponse.status, 200, 'recruiter application detail', detailResponse.raw);

  const cvResponse = await request<ApplicationCvDownloadResponse>(
    'GET',
    `/recruiter/applications/${applicationId}/cv`,
    recruiterHeaders(),
  );
  expectStatus(cvResponse.status, 200, 'recruiter CV URL', cvResponse.raw);
}

async function withdraw(applicationId: string): Promise<void> {
  logSection('6. Withdraw application');
  const response = await request<ApplicationResponse>(
    'POST',
    `/applications/me/${applicationId}/withdraw`,
    candidateHeaders(),
    { note: 'Application flow test withdraw.' },
  );

  if (!expectStatus(response.status, 200, 'withdraw application', response.raw)) {
    return;
  }

  if (response.data.status === 'WITHDRAWN') {
    pass('application moved to WITHDRAWN');
  } else {
    fail('withdraw response has unexpected status', response.raw);
  }
}

async function applyAgainAfterWithdraw(): Promise<void> {
  logSection('7. Apply again after withdraw');
  const response = await request<ApplicationResponse>('POST', '/applications', candidateHeaders(), {
    jobId: JOB_ID,
    candidateCvId: CANDIDATE_CV_ID,
  });

  if (!expectStatus(response.status, 201, 'apply again after withdraw', response.raw)) {
    return;
  }

  if (response.data.status === 'SUBMITTED') {
    pass('withdrawn application does not block a new application');
  } else {
    fail('new application status is unexpected', response.raw);
  }
}

async function main(): Promise<void> {
  requireEnv();

  log('APPLICATION API LIVE TEST', 'cyan');
  log(`Base URL: ${BASE_URL}`, 'yellow');
  log(`Job ID: ${JOB_ID}`, 'yellow');
  log(`Candidate CV ID: ${CANDIDATE_CV_ID}`, 'yellow');

  const application = await createApplication();
  if (!application) {
    process.exit(1);
  }

  await rejectDuplicateActiveApplication();
  await listAndDetail(application.id);
  await getCandidateCv(application);
  await recruiterChecks(application.id);
  await withdraw(application.id);
  await applyAgainAfterWithdraw();

  logSection('Result');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'dim');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  fail('Fatal error', error);
  process.exit(1);
});
