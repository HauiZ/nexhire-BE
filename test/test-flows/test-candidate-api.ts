import 'dotenv/config';
import { randomUUID } from 'crypto';

const BASE_URL = process.env.CANDIDATE_TEST_BASE_URL ?? 'http://localhost:3000/api/v1';
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

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

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
    headers: buildHeaders(),
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

async function main(): Promise<void> {
  log('CANDIDATE PROFILE API LIVE TEST', 'cyan');
  log(`Base URL: ${BASE_URL}`, 'yellow');
  log(`User ID: ${userId}`, 'yellow');

  await ensureGatewayIdentity();
  await getProfile('1. Get or lazy-create profile');
  await updateProfile();
  await clearSkills();
  await rejectDuplicateSkill();

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
