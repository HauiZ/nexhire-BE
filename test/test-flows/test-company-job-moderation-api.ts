import 'dotenv/config';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { assertMigrationsApplied } from './flow-preflight';

const BASE_URL = process.env.COMPANY_JOB_FLOW_BASE_URL ?? 'http://localhost:3000/api/v1';
const flowId = process.env.TEST_FLOW_RUN_ID ?? String(Date.now());
let recruiterToken = process.env.COMPANY_JOB_FLOW_RECRUITER_TOKEN;
let adminToken = process.env.COMPANY_JOB_FLOW_ADMIN_TOKEN;
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
let recruiterRefreshToken = process.env.COMPANY_JOB_FLOW_RECRUITER_REFRESH_TOKEN;
const recruiterEmail =
  process.env.COMPANY_JOB_FLOW_RECRUITER_EMAIL ?? `flow-recruiter-${flowId}@nexhire.local`;
const recruiterPassword = process.env.COMPANY_JOB_FLOW_RECRUITER_PASSWORD ?? 'StrongPassword123!';
let recruiterUserId =
  process.env.COMPANY_JOB_FLOW_RECRUITER_USER_ID ?? randomUUID();
const ADMIN_USER_ID = process.env.COMPANY_JOB_FLOW_ADMIN_USER_ID ?? randomUUID();
const PROVIDED_COMPANY_ID = process.env.COMPANY_JOB_FLOW_COMPANY_ID;
const KEEP_DATA = process.env.COMPANY_JOB_FLOW_KEEP_DATA === 'true';

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

interface AuthResponse {
  user: {
    id: string;
    role: string;
    companyId?: string | null;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
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
let createdCompanyId: string | null = null;
const createdJobs: Array<{ id: string; title: string }> = [];

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
    console.log(formatError(data));
  }
}

function formatError(data: unknown): string {
  if (data instanceof Error) {
    return JSON.stringify(
      {
        name: data.name,
        message: data.message,
        stack: data.stack,
      },
      null,
      2,
    );
  }

  return JSON.stringify(data, null, 2);
}

function isGatewayMode(): boolean {
  return BASE_URL.includes('localhost:3000') || BASE_URL.includes('/api/v1');
}

function printGatewayTokenHelp(): void {
  log('Gateway mode requires real JWT tokens because gateway injects identity headers.', 'yellow');
  log('Set these before running:', 'yellow');
  log('$env:COMPANY_JOB_FLOW_ADMIN_TOKEN="admin-access-token" # optional when JWT_ACCESS_SECRET exists', 'dim');
  log('$env:JWT_ACCESS_SECRET="local-gateway-access-secret" # optional admin token mint fallback', 'dim');
  log(
    '$env:COMPANY_JOB_FLOW_RECRUITER_TOKEN="recruiter-access-token" # optional; script can register recruiter',
    'dim',
  );
  log(
    '$env:COMPANY_JOB_FLOW_COMPANY_ID="approved-company-id" # optional when token already has companyId',
    'dim',
  );
  log(
    '$env:COMPANY_JOB_FLOW_RECRUITER_REFRESH_TOKEN="recruiter-refresh-token" # optional for create-company flow',
    'dim',
  );
  log(
    '$env:COMPANY_JOB_FLOW_RECRUITER_EMAIL="hr@company.vn"; $env:COMPANY_JOB_FLOW_RECRUITER_PASSWORD="StrongPassword123!" # optional alternative',
    'dim',
  );
  log(
    'If the script creates the company, it must refresh or login again after admin approval so the recruiter JWT contains companyId.',
    'yellow',
  );
}

function validateRuntimeConfig(): boolean {
  if (!isGatewayMode()) {
    return true;
  }
  return true;
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
  if (recruiterToken) {
    headers.Authorization = `Bearer ${recruiterToken}`;
  }
  headers['x-user-id'] = recruiterUserId;
  headers['x-user-role'] = 'RECRUITER';
  if (nextCompanyId) {
    headers['x-company-id'] = nextCompanyId;
  }
  return headers;
}

function adminHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
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
    (!recruiterToken || !adminToken)
  ) {
    printGatewayTokenHelp();
  }
  return false;
}

function expectStatusOneOf(
  actual: number,
  expected: number[],
  label: string,
  data?: unknown,
): boolean {
  if (expected.includes(actual)) {
    pass(`${label} -> ${actual}`);
    return true;
  }

  fail(`${label}: expected ${expected.join(' or ')}, got ${actual}`, data);
  return false;
}

function printCompanyCreateFailureHint(): void {
  log('Company create returned 500. Check company-service logs for the real DB/error message.', 'yellow');
  log('Common local fixes:', 'yellow');
  log('npm run db:company:run', 'dim');
  log('npm run db:auth:seed', 'dim');
  log('Restart company-service/gateway if they are running from stale dist output.', 'dim');
}

function mintAdminToken(): boolean {
  if (adminToken) {
    return true;
  }
  if (!JWT_ACCESS_SECRET) {
    return false;
  }
  adminToken = new JwtService().sign(
    {
      sub: ADMIN_USER_ID,
      role: 'ADMIN',
      jti: randomUUID(),
    },
    {
      secret: JWT_ACCESS_SECRET,
      expiresIn: 900,
    },
  );
  pass('minted local admin JWT from JWT_ACCESS_SECRET');
  return true;
}

function mintRecruiterToken(nextCompanyId?: string): boolean {
  if (!JWT_ACCESS_SECRET) {
    return false;
  }
  recruiterToken = new JwtService().sign(
    {
      sub: recruiterUserId,
      role: 'RECRUITER',
      ...(nextCompanyId ? { companyId: nextCompanyId } : {}),
      jti: randomUUID(),
    },
    {
      secret: JWT_ACCESS_SECRET,
      expiresIn: 900,
    },
  );
  pass(
    nextCompanyId
      ? 'minted local recruiter JWT with companyId'
      : 'minted local recruiter JWT',
  );
  return true;
}

function ensureAdminAuth(): boolean {
  if (!isGatewayMode()) {
    return true;
  }
  if (mintAdminToken()) {
    return true;
  }
  fail('missing gateway admin JWT token');
  printGatewayTokenHelp();
  return false;
}

async function registerRecruiter(): Promise<boolean> {
  const response = await request<AuthResponse>(
    'POST',
    '/auth/register',
    { 'Content-Type': 'application/json' },
    {
      fullName: 'Flow Recruiter',
      phone: `090${String(flowId).slice(-7)}`,
      email: recruiterEmail,
      password: recruiterPassword,
      role: 'RECRUITER',
    },
  );
  if (!expectStatus(response.status, 201, 'register recruiter', response.raw)) {
    return false;
  }
  recruiterUserId = response.data.user.id;
  recruiterToken = response.data.tokens.accessToken;
  recruiterRefreshToken = response.data.tokens.refreshToken;
  pass(`registered recruiter ${recruiterEmail}`);
  return true;
}

async function loginRecruiter(label = 'login recruiter'): Promise<AuthResponse | null> {
  const response = await request<AuthResponse>(
    'POST',
    '/auth/login',
    { 'Content-Type': 'application/json' },
    {
      email: recruiterEmail,
      password: recruiterPassword,
      role: 'RECRUITER',
    },
  );
  if (!expectStatus(response.status, 200, label, response.raw)) {
    return null;
  }
  recruiterUserId = response.data.user.id;
  recruiterToken = response.data.tokens.accessToken;
  recruiterRefreshToken = response.data.tokens.refreshToken;
  return response.data;
}

async function ensureRecruiterAuth(): Promise<boolean> {
  if (recruiterToken) {
    return true;
  }
  if (!isGatewayMode()) {
    return true;
  }
  if (mintRecruiterToken(PROVIDED_COMPANY_ID)) {
    return true;
  }
  return registerRecruiter();
}

async function refreshRecruiterTokenAfterCompanyApproval(): Promise<boolean> {
  if (PROVIDED_COMPANY_ID) {
    return true;
  }

  if (mintRecruiterToken(companyId ?? undefined)) {
    return true;
  }

  if (recruiterRefreshToken) {
    const response = await request<AuthResponse>(
      'POST',
      '/auth/refresh',
      { 'Content-Type': 'application/json' },
      { refreshToken: recruiterRefreshToken },
    );
    if (!expectStatus(response.status, 200, 'refresh recruiter token after company approval', response.raw)) {
      return false;
    }
    recruiterToken = response.data.tokens.accessToken;
    if (response.data.user.companyId === companyId) {
      pass('refreshed recruiter token contains approved companyId');
      return true;
    }
    fail('refreshed recruiter token does not contain approved companyId', response.raw);
    return false;
  }

  if (recruiterEmail && recruiterPassword) {
    const auth = await loginRecruiter('login recruiter after company approval');
    if (!auth) {
      return false;
    }
    if (auth.user.companyId === companyId) {
      pass('new recruiter token contains approved companyId');
      return true;
    }
    fail('new recruiter token does not contain approved companyId', auth);
    return false;
  }

  fail('recruiter token cannot be refreshed after creating company');
  log(
    'Set COMPANY_JOB_FLOW_RECRUITER_REFRESH_TOKEN, or set COMPANY_JOB_FLOW_RECRUITER_EMAIL and COMPANY_JOB_FLOW_RECRUITER_PASSWORD, or provide COMPANY_JOB_FLOW_COMPANY_ID with a recruiter token that already contains companyId.',
    'yellow',
  );
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
    taxCode: `FLOW${flowId}`,
  });

  if (!expectStatus(createResponse.status, 201, 'create company', createResponse.raw)) {
    if (createResponse.status === 500) {
      printCompanyCreateFailureHint();
    }
    return null;
  }

  companyId = createResponse.data.id;
  createdCompanyId = companyId;
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
    if (await refreshRecruiterTokenAfterCompanyApproval()) {
      return companyId;
    }
    return null;
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
    createdJobs.push({ id: response.data.id, title: response.data.title });
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

  if (!expectStatusOneOf(response.status, [200, 201], `submit ${job.title}`, response.raw)) {
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
  const response = await request<PaginatedResponse<JobResponse> | JobResponse[]>(
    'GET',
    `/admin/jobs/review-queue?search=${encodeURIComponent(safeJobTitle)}`,
    adminHeaders(),
  );

  if (!expectStatus(response.status, 200, 'list review queue', response.raw)) {
    return;
  }

  const jobs = Array.isArray(response.data) ? response.data : response.data.data;
  if (jobs.some((job) => job.id === jobId)) {
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

  if (!expectStatusOneOf(response.status, [200, 201], 'approve job', response.raw)) {
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
  const listResponse = await request<PaginatedResponse<JobResponse> | JobResponse[]>(
    'GET',
    `/jobs?q=${encodeURIComponent(safeJobTitle)}`,
  );
  const jobs = Array.isArray(listResponse.data) ? listResponse.data : listResponse.data.data;
  if (
    expectStatus(listResponse.status, 200, 'public list jobs', listResponse.raw) &&
    jobs.some((job) => job.id === jobId)
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
  if (!expectStatusOneOf(unpublishResponse.status, [200, 201], 'admin unpublish job', unpublishResponse.raw)) {
    return;
  }
  await expectPublicDetail(jobId, 404, 'public detail hidden after unpublish');

  const republishResponse = await request<JobResponse>(
    'POST',
    `/admin/jobs/${jobId}/republish`,
    adminHeaders(),
  );
  if (!expectStatusOneOf(republishResponse.status, [200, 201], 'admin republish job', republishResponse.raw)) {
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
    expectStatusOneOf(rejectResponse.status, [200, 201], 'admin reject risky job', rejectResponse.raw) &&
    rejectResponse.data.status === 'REJECTED'
  ) {
    pass('risky job is rejected by admin');
  }
}

async function cleanupJob(jobId: string, title: string): Promise<void> {
  const detail = await request<JobResponse>('GET', `/recruiter/jobs/${jobId}`, recruiterHeaders());
  if (detail.status !== 200) {
    log(`cleanup skip job ${jobId}: cannot read current status`, 'yellow');
    return;
  }

  const status = detail.data.status;
  if (['PENDING_REVIEW', 'NEEDS_REVIEW', 'SHOULD_REJECT'].includes(status)) {
    const rejectResponse = await request<JobResponse>('POST', `/admin/jobs/${jobId}/review`, adminHeaders(), {
      decision: 'REJECT',
      reason: 'Flow test cleanup rejects unfinished review job.',
    });
    if (![200, 201].includes(rejectResponse.status)) {
      log(`cleanup could not reject pending job ${jobId}`, 'yellow');
      console.log(formatError(rejectResponse.raw));
    }
  }

  const refreshed = await request<JobResponse>('GET', `/recruiter/jobs/${jobId}`, recruiterHeaders());
  const currentStatus = refreshed.status === 200 ? refreshed.data.status : status;

  if (['PUBLISHED', 'UNPUBLISHED'].includes(currentStatus)) {
    const response = await request<JobResponse>(
      'POST',
      `/admin/jobs/${jobId}/close`,
      adminHeaders(),
      { reason: 'Flow test cleanup closes job.' },
    );
      if ([200, 201].includes(response.status)) {
        pass(`cleanup closed job ${title}`);
      } else {
        log(`cleanup could not close job ${jobId}`, 'yellow');
        console.log(formatError(response.raw));
      }
    return;
  }

  if (['DRAFT', 'REJECTED'].includes(currentStatus)) {
    const response = await request<{ deleted: true }>(
      'DELETE',
      `/recruiter/jobs/${jobId}`,
      recruiterHeaders(),
    );
    if (response.status === 200) {
      pass(`cleanup deleted job ${title}`);
    } else {
      log(`cleanup could not delete job ${jobId}`, 'yellow');
    }
    return;
  }

  log(`cleanup left job ${jobId} in status ${currentStatus}`, 'yellow');
}

async function cleanup(): Promise<void> {
  if (KEEP_DATA) {
    log('Cleanup skipped because COMPANY_JOB_FLOW_KEEP_DATA=true', 'yellow');
    return;
  }
  if (createdJobs.length === 0 && !createdCompanyId) {
    return;
  }

  logSection('Cleanup');
  for (const job of [...createdJobs].reverse()) {
    try {
      await cleanupJob(job.id, job.title);
    } catch (error) {
      log(`cleanup job failed jobId=${job.id}: ${(error as Error).message}`, 'yellow');
    }
  }

  if (createdCompanyId) {
    try {
      const response = await request<CompanyResponse>(
        'PATCH',
        `/companies/admin/${createdCompanyId}/suspend`,
        adminHeaders(),
        { reason: 'Flow test cleanup suspends generated company.' },
      );
      if (response.status === 200) {
        pass(`cleanup suspended company ${createdCompanyId}`);
      } else {
        log(`cleanup could not suspend company ${createdCompanyId}`, 'yellow');
      }
    } catch (error) {
      log(`cleanup company failed companyId=${createdCompanyId}: ${(error as Error).message}`, 'yellow');
    }
  }
}

async function main(): Promise<void> {
  try {
    log('COMPANY -> JOB MODERATION -> ADMIN API LIVE TEST', 'cyan');
    log(`Base URL: ${BASE_URL}`, 'yellow');
    log(`Recruiter user: ${recruiterUserId}`, 'yellow');
    log(`Admin user: ${ADMIN_USER_ID}`, 'yellow');
    log(`Cleanup: ${KEEP_DATA ? 'disabled' : 'enabled'}`, 'yellow');

    if (!validateRuntimeConfig()) {
      throw new Error('Invalid runtime config');
    }

    if (!assertMigrationsApplied(['company-service', 'job-service'])) {
      throw new Error('Pending required migrations');
    }

    if (!ensureAdminAuth()) {
      throw new Error('Missing admin auth');
    }

    if (!(await ensureRecruiterAuth())) {
      throw new Error('Missing recruiter auth');
    }

    const approvedCompanyId = await ensureApprovedCompany();
    if (!approvedCompanyId) {
      throw new Error('Company approval failed');
    }
    companyId = approvedCompanyId;

    logSection('2. Recruiter creates and submits safe job');
    const safeDraft = await createDraft(safeJobTitle);
    if (!safeDraft) {
      throw new Error('Safe draft creation failed');
    }

    const submitted = await submitJob(safeDraft, 'PENDING_REVIEW');
    if (!submitted) {
      throw new Error('Safe job submission failed');
    }

    await verifyReviewQueue(submitted.id);
    await expectPublicDetail(submitted.id, 404, 'public detail hidden before approval');

    const approved = await approveJob(submitted.id);
    if (!approved) {
      throw new Error('Safe job approval failed');
    }

    await verifyPublicRead(approved.id);
    await verifyUnpublishRepublish(approved.id);
    await rejectRiskyJob();
  } finally {
    await cleanup();
  }

  logSection('Result');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'dim');

  if (failed > 0) {
    throw new Error('Flow test failed');
  }
}

main().catch((error) => {
  fail('Fatal error', error instanceof Error ? { message: error.message } : error);
  process.exit(1);
});
