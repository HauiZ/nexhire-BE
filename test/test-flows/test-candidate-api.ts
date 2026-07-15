import 'dotenv/config';
import { randomUUID } from 'crypto';

const BASE_URL = process.env.CANDIDATE_TEST_BASE_URL ?? 'http://localhost:3000/api/v1';
const INTERNAL_BASE_URL =
  process.env.CANDIDATE_INTERNAL_TEST_BASE_URL ?? 'http://localhost:3002/api/v1';
const INTERNAL_SERVICE_TOKEN =
  process.env.CANDIDATE_INTERNAL_TEST_TOKEN ?? process.env.INTERNAL_SERVICE_TOKEN;
const TEST_EMAIL = `candidate-test-${Date.now()}@nexhire.local`;
const TEST_PASSWORD = 'StrongPassword123!';
const USER_ROLE = 'CANDIDATE';
let userId = process.env.CANDIDATE_TEST_USER_ID ?? randomUUID();
let accessToken = process.env.CANDIDATE_TEST_TOKEN;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

interface CandidateProfileResponse {
  profile: {
    id: string;
    userId: string;
    fullName: string | null;
    phone: string | null;
    contactEmail: string | null;
    headline: string | null;
    summary: string | null;
    location: string | null;
    portfolioUrl: string | null;
    linkedinUrl: string | null;
  };
  skills: { name: string }[];
  experiences: { companyName: string; isCurrent: boolean }[];
  educations: { schoolName: string }[];
  defaultCv: null;
  cvs: unknown[];
  completionPercent: number;
}

interface CandidateCvResponse {
  id: string;
  documentId: string;
  title: string | null;
  isDefault: boolean;
  parseStatus: string;
}

interface CandidateApplicationSnapshotResponse {
  candidateId: string;
  candidateUserId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  avatarDocumentId: string | null;
  candidateCvId: string;
  cvDocumentId: string;
  cvTitle: string | null;
  cvParseStatus: string;
}

interface ApiEnvelope<T> {
  data?: T;
}

interface AuthResponse {
  user: {
    id: string;
    email: string;
    role: string;
  };
  tokens: {
    accessToken: string;
  };
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
    console.log(formatError(data));
  }
}

function formatError(data: unknown): string {
  if (data instanceof Error) {
    const errorWithCause = data as Error & { cause?: unknown };

    return JSON.stringify(
      {
        name: data.name,
        message: data.message,
        cause: errorWithCause.cause,
      },
      null,
      2,
    );
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

function buildHeaders(contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  }

  headers['x-user-id'] = userId;
  headers['x-user-role'] = USER_ROLE;
  return headers;
}

async function request<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: T; raw: unknown }> {
  const url = `${BASE_URL}${path}`;
  log(`${method} ${url}`, 'blue');

  const response = await fetch(url, {
    method,
    headers: buildHeaders('application/json'),
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

async function upload<T>(
  path: string,
  form: FormData,
): Promise<{ status: number; data: T; raw: unknown }> {
  const url = `${BASE_URL}${path}`;
  log(`POST ${url}`, 'blue');

  const response = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: form,
  });
  const text = await response.text();
  const raw = text ? JSON.parse(text) : {};

  return {
    status: response.status,
    data: unwrap<T>(raw),
    raw,
  };
}

async function patchUpload<T>(
  path: string,
  form: FormData,
): Promise<{ status: number; data: T; raw: unknown }> {
  const url = `${BASE_URL}${path}`;
  log(`PATCH ${url}`, 'blue');

  const response = await fetch(url, {
    method: 'PATCH',
    headers: buildHeaders(),
    body: form,
  });
  const text = await response.text();
  const raw = text ? JSON.parse(text) : {};

  return {
    status: response.status,
    data: unwrap<T>(raw),
    raw,
  };
}

async function ensureGatewayIdentity(): Promise<void> {
  if (accessToken || process.env.CANDIDATE_TEST_USER_ID) {
    return;
  }

  logSection('0. Register candidate test identity');
  log(`Email: ${TEST_EMAIL}`, 'yellow');

  const response = await request<AuthResponse>('POST', '/auth/register', {
    fullName: 'Candidate Flow Test',
    phone: '0987654321',
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    role: USER_ROLE,
  });

  if (!expectStatus(response.status, 201, 'register candidate test identity', response.raw)) {
    process.exit(1);
  }

  userId = response.data.user.id;
  accessToken = response.data.tokens.accessToken;
  pass('gateway identity token ready');
}

function expectStatus(actual: number, expected: number, label: string, data?: unknown): boolean {
  if (actual === expected) {
    pass(`${label} -> ${expected}`);
    return true;
  }

  fail(`${label}: expected ${expected}, got ${actual}`, data);
  return false;
}

async function getProfile(label: string): Promise<CandidateProfileResponse | null> {
  logSection(label);
  const response = await request<CandidateProfileResponse>('GET', '/candidates/me');
  if (!expectStatus(response.status, 200, label, response.raw)) {
    return null;
  }

  if (response.data.profile?.userId === userId && Array.isArray(response.data.skills)) {
    pass('profile aggregate response shape is valid');
    return response.data;
  }

  fail('profile aggregate response shape is invalid', response.raw);
  return null;
}

async function updateProfile(): Promise<CandidateProfileResponse | null> {
  logSection('2. Patch aggregate profile');
  const response = await request<CandidateProfileResponse>('PATCH', '/candidates/me', {
    profile: {
      fullName: 'Nguyen Minh Khoa',
      phone: '0912345678',
      contactEmail: 'khoa.nguyen@example.com',
      headline: 'Senior Frontend Engineer',
      summary: 'Builds performant web products.',
      location: 'Ha Noi, Viet Nam',
      portfolioUrl: 'https://minhkhoa.dev',
      linkedinUrl: 'https://linkedin.com/in/minhkhoa',
    },
    skills: [{ name: 'React' }, { name: 'TypeScript' }, { name: 'Node.js' }],
    experiences: [
      {
        companyName: 'FPT Software',
        position: 'Senior Frontend Engineer',
        startMonth: 3,
        startYear: 2022,
        isCurrent: true,
      },
    ],
    educations: [
      {
        schoolName: 'Dai hoc Bach Khoa Ha Noi',
        degree: 'Ky su Cong nghe thong tin',
        startYear: 2015,
        endYear: 2019,
      },
    ],
  });

  if (!expectStatus(response.status, 200, 'patch aggregate profile', response.raw)) {
    return null;
  }

  const data = response.data;
  if (
    data.profile.fullName === 'Nguyen Minh Khoa' &&
    data.skills.length === 3 &&
    data.experiences.length === 1 &&
    data.educations.length === 1 &&
    data.completionPercent > 0
  ) {
    pass('aggregate patch stores profile, skills, experiences, and educations');
    return data;
  }

  fail('aggregate patch response is invalid', response.raw);
  return null;
}

async function clearSkills(): Promise<void> {
  logSection('3. Empty skills section clears skills');
  const response = await request<CandidateProfileResponse>('PATCH', '/candidates/me', {
    skills: [],
  });

  if (!expectStatus(response.status, 200, 'clear skills', response.raw)) {
    return;
  }

  if (response.data.skills.length === 0 && response.data.experiences.length === 1) {
    pass('empty skills clears skills and omitted experiences stay unchanged');
    return;
  }

  fail('empty-vs-omitted collection semantics are invalid', response.raw);
}

async function rejectDuplicateSkill(): Promise<void> {
  logSection('4. Reject duplicate skill');
  const response = await request<unknown>('PATCH', '/candidates/me', {
    skills: [{ name: 'React' }, { name: ' react ' }],
  });

  expectStatus(response.status, 409, 'duplicate skill rejected', response.raw);
}

function createPdfBlob(): Blob {
  return new Blob([Buffer.from('%PDF-1.4\n% NexHire candidate flow CV\n')], {
    type: 'application/pdf',
  });
}

function createPngBlob(): Blob {
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lHjH2wAAAABJRU5ErkJggg==',
    'base64',
  );

  return new Blob([pngBytes], { type: 'image/png' });
}

async function uploadAvatar(): Promise<void> {
  logSection('5. Upload avatar');

  const form = new FormData();
  form.append('file', createPngBlob(), 'candidate-avatar.png');

  const response = await patchUpload<CandidateProfileResponse>('/candidates/me/avatar', form);
  if (!expectStatus(response.status, 200, 'upload avatar', response.raw)) {
    return;
  }

  if (response.data.profile?.userId === userId) {
    pass('avatar upload returns profile aggregate');
    return;
  }

  fail('avatar upload response shape is invalid', response.raw);
}

async function uploadCv(): Promise<CandidateCvResponse | null> {
  logSection('6. Upload CV');

  const form = new FormData();
  form.append('file', createPdfBlob(), 'candidate-flow-cv.pdf');
  form.append('title', 'Candidate Flow CV');
  form.append('isDefault', 'true');

  const response = await upload<CandidateCvResponse>('/cvs/upload', form);
  if (!expectStatus(response.status, 201, 'upload CV', response.raw)) {
    return null;
  }

  if (response.data.id && response.data.documentId && response.data.isDefault) {
    pass('CV upload returns candidate CV metadata');
    log(`Candidate CV ID: ${response.data.id}`, 'dim');
    return response.data;
  }

  fail('CV upload response shape is invalid', response.raw);
  return null;
}

async function verifyCvInProfile(candidateCvId: string): Promise<void> {
  logSection('7. Verify CV appears in profile aggregate');
  const profile = await getProfile('Get profile after CV upload');
  if (!profile) {
    return;
  }

  const hasUploadedCv = profile.cvs.some((cv) => {
    return typeof cv === 'object' && cv !== null && 'id' in cv && cv.id === candidateCvId;
  });

  if (hasUploadedCv) {
    pass('uploaded CV is included in profile aggregate');
    return;
  }

  fail('uploaded CV is missing from profile aggregate', profile);
}

async function verifyApplicationSnapshot(candidateCv: CandidateCvResponse): Promise<void> {
  logSection('8. Internal application snapshot');

  if (!INTERNAL_SERVICE_TOKEN) {
    log('Skipped: set CANDIDATE_INTERNAL_TEST_TOKEN or INTERNAL_SERVICE_TOKEN.', 'yellow');
    return;
  }

  const url = `${INTERNAL_BASE_URL}/internal/candidates/users/${userId}/cvs/${candidateCv.id}/application-snapshot`;
  log(`GET ${url}`, 'blue');

  const response = await fetch(url, {
    headers: {
      'x-internal-service-token': INTERNAL_SERVICE_TOKEN,
    },
  });
  const text = await response.text();
  const raw = text ? JSON.parse(text) : {};
  const data = unwrap<CandidateApplicationSnapshotResponse>(raw);

  if (!expectStatus(response.status, 200, 'get application snapshot', raw)) {
    return;
  }

  if (
    data.candidateUserId === userId &&
    data.candidateCvId === candidateCv.id &&
    data.cvDocumentId === candidateCv.documentId &&
    data.email
  ) {
    pass('snapshot includes candidate, contact email, and CV metadata');
    return;
  }

  fail('application snapshot response shape is invalid', raw);
}

async function main(): Promise<void> {
  log('CANDIDATE PROFILE API LIVE TEST', 'cyan');
  log(`Base URL: ${BASE_URL}`, 'yellow');
  log(`User ID: ${userId}`, 'yellow');

  await ensureGatewayIdentity();
  await getProfile('1. Get or lazy-create profile');
  await updateProfile();
  await clearSkills();
  await rejectDuplicateSkill();
  await uploadAvatar();
  const candidateCv = await uploadCv();
  if (candidateCv) {
    await verifyCvInProfile(candidateCv.id);
    await verifyApplicationSnapshot(candidateCv);
  }

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
