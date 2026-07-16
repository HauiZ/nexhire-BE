import 'dotenv/config';
import { randomUUID } from 'crypto';

const BASE_URL = process.env.COMPANY_JOB_FLOW_BASE_URL ?? 'http://localhost:3000/api/v1';
const RECRUITER_TOKEN = process.env.COMPANY_JOB_FLOW_RECRUITER_TOKEN;
const ADMIN_TOKEN = process.env.COMPANY_JOB_FLOW_ADMIN_TOKEN;
const RECRUITER_USER_ID =
  process.env.COMPANY_JOB_FLOW_RECRUITER_USER_ID ?? 'flow-recruiter-user-id';
const ADMIN_USER_ID = process.env.COMPANY_JOB_FLOW_ADMIN_USER_ID ?? 'flow-admin-user-id';
const PROVIDED_COMPANY_ID = process.env.COMPANY_JOB_FLOW_COMPANY_ID;

const flowId = Date.now();
const companyName = `NexHire Flow Company ${flowId}`;
const safeJobTitle = `Backend Flow Job ${flowId}`;
const riskyJobTitle = `Remote Risk Flow Job ${flowId}`;

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

interface CompanyResponse {
  id: string;
  status: string;
}

interface JobResponse {
  id: string;
  title: string;
  status: string;
  companyId: string;
  moderation?: {
    riskScore: number | null;
    riskLevel: string | null;
    decision: string | null;
    reasons: string[];
    matchedRules: string[];
  };
}

interface PaginatedResponse<T> {
  data: T[];
  meta?: {
    total: number;
  };
}

let passed = 0;
let failed = 0;
let companyId = PROVIDED_COMPANY_ID;

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

function recruiterHeaders(nextCompanyId = companyId): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (RECRUITER_TOKEN) {
    headers.Authorization = `Bearer ${RECRUITER_TOKEN}`;
  }
  headers['x-user-id'] = RECRUITER_USER_ID;
  headers['x-user-role'] = 'RECRUITER';
  if (nextCompanyId) {
    headers['x-company-id'] = nextCompanyId;
  }
  return headers;
}

function adminHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ADMIN_TOKEN) {
    headers.Authorization = `Bearer ${ADMIN_TOKEN}`;
  }
  headers['x-user-id'] = ADMIN_USER_ID;
  headers['x-user-role'] = 'ADMIN';
  return headers;
}

async function request<T>(
  method: string,
  path: string,
  headers: Record<string, string> = { 'Content-Type': 'application/json' },
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
  if (
    (actual === 401 || actual === 403) &&
    BASE_URL.includes('localhost:3000') &&
    (!RECRUITER_TOKEN || !ADMIN_TOKEN)
  ) {
    log(
      'Hint: gateway mode needs real recruiter/admin JWT tokens. Header identity fallback is only useful when calling a trusted internal service/proxy setup.',
      'yellow',
    );
  }
  return false;
}

function jobPayload(title: string, risky = false): Record<string, unknown> {
  if (risky) {
    return {
      title,
      description:
        'Ung vien can dong phi ho so va chuyen khoan truoc de nhan viec. Lam tai nha thu nhap khung, nap tien theo huong dan.',
      requirements: 'Co dien thoai va tai khoan ngan hang.',
      skills: ['Online sales'],
      benefits: 'Thu nhap khong gioi han.',
      employmentType: 'PART_TIME',
      workingType: 'REMOTE',
      experienceLevel: 'INTERN',
      location: 'Remote',
      salaryMin: 10_000_000,
      salaryMax: 50_000_000,
      salaryCurrency: 'VND',
      isSalaryVisible: true,
      deadline: '2026-12-31T17:00:00.000Z',
      numberOfOpenings: 5,
    };
  }

  return {
    title,
    description:
      'Develop and maintain REST APIs for a recruitment platform using NestJS, PostgreSQL, and RabbitMQ with a collaborative engineering team.',
    requirements:
      'At least one year of experience with Node.js, TypeScript, PostgreSQL, Git, and REST API development.',
    skills: ['NestJS', 'PostgreSQL', 'RabbitMQ'],
    benefits: 'Hybrid work, insurance, learning budget, and annual performance review.',
    employmentType: 'FULL_TIME',
    workingType: 'HYBRID',
    experienceLevel: 'JUNIOR',
    location: 'Ha Noi, Viet Nam',
    salaryMin: 15_000_000,
    salaryMax: 25_000_000,
    salaryCurrency: 'VND',
    isSalaryVisible: true,
    deadline: '2026-12-31T17:00:00.000Z',
    numberOfOpenings: 2,
  };
}

async function ensureApprovedCompany(): Promise<string | null> {
  logSection('1. Company approved for posting');

  if (PROVIDED_COMPANY_ID) {
    pass(`using provided company ${PROVIDED_COMPANY_ID}`);
    return PROVIDED_COMPANY_ID;
  }

  const createResponse = await request<CompanyResponse>('POST', '/companies', recruiterHeaders(), {
    name: companyName,
    logo: 'https://cdn.nexhire.vn/company/flow-test.png',
    description: 'Company created by job moderation live flow test.',
    website: 'https://nexhire.local',
    address: 'Ha Noi, Viet Nam',
    taxCode: `FLOW-${randomUUID().slice(0, 18)}`,
  });

  if (!expectStatus(createResponse.status, 201, 'create company', createResponse.raw)) {
    return null;
  }

  companyId = createResponse.data.id;
  if (!companyId) {
    fail('company response has no id', createResponse.raw);
    return null;
  }

  const approveResponse = await request<CompanyResponse>(
    'PATCH',
    `/companies/${companyId}/verify`,
    adminHeaders(),
    { action: 'APPROVE' },
  );

  if (!expectStatus(approveResponse.status, 200, 'approve company', approveResponse.raw)) {
    return null;
  }

  if (approveResponse.data.status === 'APPROVED') {
    pass('company is approved');
    return companyId;
  }

  fail('company was not approved', approveResponse.raw);
  return null;
}

async function createDraft(title: string, risky = false): Promise<JobResponse | null> {
  const response = await request<JobResponse>(
    'POST',
    '/recruiter/jobs',
    recruiterHeaders(),
    jobPayload(title, risky),
  );

  if (!expectStatus(response.status, 201, `create ${risky ? 'risky' : 'safe'} draft`, response.raw)) {
    return null;
  }

  if (response.data.status === 'DRAFT' && response.data.id) {
    pass('draft job response is valid');
    return response.data;
  }

  fail('draft job response shape is invalid', response.raw);
  return null;
}

async function submitJob(job: JobResponse, expectedStatus: string): Promise<JobResponse | null> {
  const response = await request<JobResponse>(
    'POST',
    `/recruiter/jobs/${job.id}/submit`,
    recruiterHeaders(),
  );

  if (!expectStatus(response.status, 200, `submit ${job.title}`, response.raw)) {
    return null;
  }

  if (response.data.status === expectedStatus && response.data.moderation?.decision) {
    pass(`moderation mapped job to ${expectedStatus}`);
    return response.data;
  }

  fail(`submit response did not map to ${expectedStatus}`, response.raw);
  return null;
}

async function verifyReviewQueue(jobId: string): Promise<void> {
  logSection('3. Admin review queue');
  const response = await request<PaginatedResponse<JobResponse>>(
    'GET',
    `/admin/jobs/review-queue?search=${encodeURIComponent(safeJobTitle)}`,
    adminHeaders(),
  );

  if (!expectStatus(response.status, 200, 'list review queue', response.raw)) {
    return;
  }

  if (response.data.data.some((job) => job.id === jobId)) {
    pass('submitted job appears in review queue');
  } else {
    fail('submitted job is missing from review queue', response.raw);
  }
}

async function expectPublicDetail(jobId: string, expectedStatus: number, label: string): Promise<void> {
  const response = await request<JobResponse>('GET', `/jobs/${jobId}`);
  expectStatus(response.status, expectedStatus, label, response.raw);
}

async function approveJob(jobId: string): Promise<JobResponse | null> {
  logSection('4. Admin approves safe job');
  const response = await request<JobResponse>(
    'POST',
    `/admin/jobs/${jobId}/review`,
    adminHeaders(),
    {
      decision: 'APPROVE',
      reason: 'Live flow test verified safe job content.',
    },
  );

  if (!expectStatus(response.status, 200, 'approve job', response.raw)) {
    return null;
  }

  if (response.data.status === 'PUBLISHED') {
    pass('job is published after admin approval');
    return response.data;
  }

  fail('approved job was not published', response.raw);
  return null;
}

async function verifyPublicRead(jobId: string): Promise<void> {
  logSection('5. Public job list/detail');
  const listResponse = await request<PaginatedResponse<JobResponse>>(
    'GET',
    `/jobs?q=${encodeURIComponent(safeJobTitle)}`,
  );
  if (
    expectStatus(listResponse.status, 200, 'public list jobs', listResponse.raw) &&
    listResponse.data.data.some((job) => job.id === jobId)
  ) {
    pass('published job appears in public search');
  }

  await expectPublicDetail(jobId, 200, 'public detail published job');
}

async function verifyUnpublishRepublish(jobId: string): Promise<void> {
  logSection('6. Admin unpublish/republish');
  const unpublishResponse = await request<JobResponse>(
    'POST',
    `/admin/jobs/${jobId}/unpublish`,
    adminHeaders(),
    { reason: 'Live flow test temporarily hides job.' },
  );
  if (!expectStatus(unpublishResponse.status, 200, 'admin unpublish job', unpublishResponse.raw)) {
    return;
  }
  await expectPublicDetail(jobId, 404, 'public detail hidden after unpublish');

  const republishResponse = await request<JobResponse>(
    'POST',
    `/admin/jobs/${jobId}/republish`,
    adminHeaders(),
  );
  if (!expectStatus(republishResponse.status, 200, 'admin republish job', republishResponse.raw)) {
    return;
  }
  await expectPublicDetail(jobId, 200, 'public detail visible after republish');
}

async function rejectRiskyJob(): Promise<void> {
  logSection('7. Risky job should reject recommendation');
  const riskyDraft = await createDraft(riskyJobTitle, true);
  if (!riskyDraft) {
    return;
  }

  const submitted = await submitJob(riskyDraft, 'SHOULD_REJECT');
  if (!submitted) {
    return;
  }

  if (submitted.moderation?.riskLevel === 'CRITICAL') {
    pass('risky job is classified as critical');
  } else {
    fail('risky job risk level is unexpected', submitted);
  }

  const rejectResponse = await request<JobResponse>(
    'POST',
    `/admin/jobs/${submitted.id}/review`,
    adminHeaders(),
    {
      decision: 'REJECT',
      reason: 'Live flow test rejects scam-like content.',
    },
  );

  if (
    expectStatus(rejectResponse.status, 200, 'admin reject risky job', rejectResponse.raw) &&
    rejectResponse.data.status === 'REJECTED'
  ) {
    pass('risky job is rejected by admin');
  }
}

async function main(): Promise<void> {
  log('COMPANY -> JOB MODERATION -> ADMIN API LIVE TEST', 'cyan');
  log(`Base URL: ${BASE_URL}`, 'yellow');
  log(`Recruiter user: ${RECRUITER_USER_ID}`, 'yellow');
  log(`Admin user: ${ADMIN_USER_ID}`, 'yellow');

  const approvedCompanyId = await ensureApprovedCompany();
  if (!approvedCompanyId) {
    process.exit(1);
  }
  companyId = approvedCompanyId;

  logSection('2. Recruiter creates and submits safe job');
  const safeDraft = await createDraft(safeJobTitle);
  if (!safeDraft) {
    process.exit(1);
  }

  const submitted = await submitJob(safeDraft, 'PENDING_REVIEW');
  if (!submitted) {
    process.exit(1);
  }

  await verifyReviewQueue(submitted.id);
  await expectPublicDetail(submitted.id, 404, 'public detail hidden before approval');

  const approved = await approveJob(submitted.id);
  if (!approved) {
    process.exit(1);
  }

  await verifyPublicRead(approved.id);
  await verifyUnpublishRepublish(approved.id);
  await rejectRiskyJob();

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
