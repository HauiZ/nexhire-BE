import 'dotenv/config';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { assertMigrationsApplied, MigratedService } from './flow-preflight';

const BASE_URL = process.env.APPLICATION_TEST_BASE_URL ?? 'http://localhost:3000/api/v1';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
let jobId = process.env.APPLICATION_TEST_JOB_ID;
let candidateCvId = process.env.APPLICATION_TEST_CANDIDATE_CV_ID;
let candidateToken = process.env.APPLICATION_TEST_CANDIDATE_TOKEN;
const candidateUserId = process.env.APPLICATION_TEST_CANDIDATE_USER_ID ?? randomUUID();
let recruiterToken = process.env.APPLICATION_TEST_RECRUITER_TOKEN;
const recruiterUserId = process.env.APPLICATION_TEST_RECRUITER_USER_ID ?? randomUUID();
let recruiterCompanyId = process.env.APPLICATION_TEST_RECRUITER_COMPANY_ID;
let adminToken = process.env.APPLICATION_TEST_ADMIN_TOKEN;
const ADMIN_USER_ID = process.env.APPLICATION_TEST_ADMIN_USER_ID ?? randomUUID();
const KEEP_DATA = process.env.APPLICATION_TEST_KEEP_DATA === 'true';
const flowId = process.env.TEST_FLOW_RUN_ID ?? String(Date.now());
const applicationCoverLetter = `Application flow test cover letter ${flowId}.`;

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
}

interface CandidateCvResponse {
  id: string;
  documentId: string;
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
let createdCompanyId: string | null = null;
let createdJobId: string | null = null;
let uploadedCvDocumentId: string | null = null;
const createdApplicationIds: string[] = [];

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
    return JSON.stringify({ message: data.message, stack: data.stack }, null, 2);
  }
  return JSON.stringify(data, null, 2);
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

function signToken(payload: Record<string, unknown>): string {
  if (!JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET is required when tokens are not provided');
  }
  return new JwtService().sign(
    { ...payload, jti: randomUUID() },
    { secret: JWT_ACCESS_SECRET, expiresIn: 900 },
  );
}

function ensureTokens(): void {
  if (!candidateToken) {
    candidateToken = signToken({ sub: candidateUserId, role: 'CANDIDATE' });
    pass('minted local candidate JWT');
  }
  if (!adminToken) {
    adminToken = signToken({ sub: ADMIN_USER_ID, role: 'ADMIN' });
    pass('minted local admin JWT');
  }
  if (!recruiterToken) {
    recruiterToken = signToken({
      sub: recruiterUserId,
      role: 'RECRUITER',
      ...(recruiterCompanyId ? { companyId: recruiterCompanyId } : {}),
    });
    pass('minted local recruiter JWT');
  }
}

function candidateHeaders(contentType = 'application/json'): Record<string, string> {
  return { 'Content-Type': contentType, Authorization: `Bearer ${candidateToken}` };
}

function recruiterHeaders(contentType = 'application/json'): Record<string, string> {
  return { 'Content-Type': contentType, Authorization: `Bearer ${recruiterToken}` };
}

function adminHeaders(contentType = 'application/json'): Record<string, string> {
  return { 'Content-Type': contentType, Authorization: `Bearer ${adminToken}` };
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

  return { status: response.status, data: unwrap<T>(raw), raw };
}

async function upload<T>(
  path: string,
  headers: Record<string, string>,
  form: FormData,
): Promise<{ status: number; data: T; raw: unknown }> {
  const url = `${BASE_URL}${path}`;
  log(`POST ${url}`, 'blue');
  const response = await fetch(url, { method: 'POST', headers, body: form });
  const text = await response.text();
  const raw = text ? JSON.parse(text) : {};
  return { status: response.status, data: unwrap<T>(raw), raw };
}

function expectStatus(actual: number, expected: number, label: string, data?: unknown): boolean {
  return expectStatusOneOf(actual, [expected], label, data);
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

function createPdfBlob(): Blob {
  return new Blob([Buffer.from('%PDF-1.4\n% NexHire application flow CV\n')], {
    type: 'application/pdf',
  });
}

function requiredMigrationServices(): MigratedService[] {
  const services: MigratedService[] = ['application-service'];
  if (!jobId) {
    services.push('company-service', 'job-service');
  }
  if (!candidateCvId) {
    services.push('candidate-service', 'document-storage-service');
  }
  return Array.from(new Set(services));
}

async function provisionCompanyAndJob(): Promise<void> {
  if (jobId) {
    return;
  }

  logSection('0. Provision published job');
  const companyResponse = await request<CompanyResponse>('POST', '/companies', recruiterHeaders(), {
    name: `Application Flow Company ${flowId}`,
    logo: 'https://cdn.nexhire.vn/company/application-flow.png',
    description: 'Company created by application live flow test.',
    website: 'https://nexhire.local',
    address: 'Ha Noi, Viet Nam',
    taxCode: `APPFLOW${flowId}`,
  });
  if (!expectStatus(companyResponse.status, 201, 'create company', companyResponse.raw)) {
    throw new Error('Company creation failed');
  }

  createdCompanyId = companyResponse.data.id;
  recruiterCompanyId = createdCompanyId;
  recruiterToken = signToken({
    sub: recruiterUserId,
    role: 'RECRUITER',
    companyId: recruiterCompanyId,
  });

  const approveCompany = await request<CompanyResponse>(
    'PATCH',
    `/admin/companies/${createdCompanyId}/verify`,
    adminHeaders(),
    { action: 'APPROVE' },
  );
  if (!expectStatus(approveCompany.status, 200, 'approve company', approveCompany.raw)) {
    throw new Error('Company approval failed');
  }

  const draft = await request<JobResponse>('POST', '/recruiter/jobs', recruiterHeaders(), {
    title: `Application Flow Job ${flowId}`,
    description:
      'Develop and maintain REST APIs for a recruitment platform using NestJS and PostgreSQL.',
    requirements: 'At least one year of experience with Node.js, TypeScript, and REST APIs.',
    skills: ['NestJS', 'PostgreSQL', 'RabbitMQ'],
    benefits: 'Hybrid work and learning budget.',
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
  });
  if (!expectStatus(draft.status, 201, 'create draft job', draft.raw)) {
    throw new Error('Draft job creation failed');
  }
  createdJobId = draft.data.id;

  const submit = await request<JobResponse>(
    'POST',
    `/recruiter/jobs/${createdJobId}/submit`,
    recruiterHeaders(),
  );
  if (!expectStatusOneOf(submit.status, [200, 201], 'submit job', submit.raw)) {
    throw new Error('Job submission failed');
  }

  const approveJob = await request<JobResponse>(
    'POST',
    `/admin/jobs/${createdJobId}/review`,
    adminHeaders(),
    { decision: 'APPROVE', reason: 'Application flow test publishes job.' },
  );
  if (!expectStatusOneOf(approveJob.status, [200, 201], 'approve job', approveJob.raw)) {
    throw new Error('Job approval failed');
  }
  jobId = createdJobId;
}

async function provisionCandidateCv(): Promise<void> {
  if (candidateCvId) {
    return;
  }

  logSection('0. Provision candidate CV');
  const form = new FormData();
  form.append('file', createPdfBlob(), `application-flow-cv-${flowId}.pdf`);
  form.append('title', `Application Flow CV ${flowId}`);
  form.append('isDefault', 'true');

  const response = await upload<CandidateCvResponse>(
    '/cvs/upload',
    {
      Authorization: `Bearer ${candidateToken}`,
    },
    form,
  );
  if (!expectStatus(response.status, 201, 'upload candidate CV', response.raw)) {
    throw new Error('Candidate CV upload failed');
  }
  candidateCvId = response.data.id;
  uploadedCvDocumentId = response.data.documentId;
}

async function createApplication(): Promise<ApplicationResponse | null> {
  logSection('1. Apply to published job');
  const response = await request<ApplicationResponse>('POST', '/applications', candidateHeaders(), {
    jobId,
    candidateCvId,
    coverLetter: applicationCoverLetter,
  });

  if (!expectStatus(response.status, 201, 'apply job', response.raw)) {
    return null;
  }

  if (
    response.data.id &&
    response.data.jobId === jobId &&
    response.data.candidateCvId === candidateCvId &&
    response.data.status === 'SUBMITTED'
  ) {
    createdApplicationIds.push(response.data.id);
    pass('application snapshot is returned');
    return response.data;
  }

  fail('application response shape is invalid', response.raw);
  return null;
}

async function rejectDuplicateActiveApplication(): Promise<void> {
  logSection('2. Reject duplicate active application');
  const response = await request<unknown>('POST', '/applications', candidateHeaders(), {
    jobId,
    candidateCvId,
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
  if (expectStatus(detailResponse.status, 200, 'get my application detail', detailResponse.raw)) {
    if (detailResponse.data.id === applicationId) {
      pass('candidate can read own application detail');
    } else {
      fail('candidate detail points to unexpected application', detailResponse.raw);
    }
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
  logSection('5. Recruiter list/detail/status');
  const listResponse = await request<unknown>(
    'GET',
    `/recruiter/applications?jobId=${jobId}`,
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

async function cleanup(): Promise<void> {
  if (KEEP_DATA) {
    log('Cleanup skipped because APPLICATION_TEST_KEEP_DATA=true', 'yellow');
    return;
  }

  logSection('Cleanup');
  if (createdApplicationIds.length > 0) {
    log(
      'Application rows are cleaned by test/test-flows/test-cleanup-data.ts because withdraw API was removed.',
      'yellow',
    );
  }

  if (createdJobId) {
    const closeResponse = await request<JobResponse>(
      'POST',
      `/admin/jobs/${createdJobId}/close`,
      adminHeaders(),
      { reason: 'Application flow cleanup closes generated job.' },
    ).catch(() => null);
    if (closeResponse && [200, 201].includes(closeResponse.status)) {
      pass(`cleanup closed job ${createdJobId}`);
    } else {
      log(`cleanup could not close job ${createdJobId}`, 'yellow');
    }
  }

  if (createdCompanyId) {
    const suspendResponse = await request<CompanyResponse>(
      'PATCH',
      `/admin/companies/${createdCompanyId}/suspend`,
      adminHeaders(),
      { reason: 'Application flow cleanup suspends generated company.' },
    ).catch(() => null);
    if (suspendResponse && [200, 201].includes(suspendResponse.status)) {
      pass(`cleanup suspended company ${createdCompanyId}`);
    } else {
      log(`cleanup could not suspend company ${createdCompanyId}`, 'yellow');
    }
  }

  if (uploadedCvDocumentId) {
    log('Uploaded CV document cleanup skipped: no document delete API yet.', 'yellow');
  }
}

async function main(): Promise<void> {
  log('APPLICATION API LIVE TEST', 'cyan');
  log(`Base URL: ${BASE_URL}`, 'yellow');
  log(`Cleanup: ${KEEP_DATA ? 'disabled' : 'enabled'}`, 'yellow');

  if (!assertMigrationsApplied(requiredMigrationServices())) {
    throw new Error('Pending required migrations');
  }
  ensureTokens();

  try {
    await provisionCompanyAndJob();
    await provisionCandidateCv();

    log(`Job ID: ${jobId}`, 'yellow');
    log(`Candidate CV ID: ${candidateCvId}`, 'yellow');

    const application = await createApplication();
    if (!application) {
      throw new Error('Application creation failed');
    }

    await rejectDuplicateActiveApplication();
    await listAndDetail(application.id);
    await getCandidateCv(application);
    await recruiterChecks(application.id);
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
