import 'dotenv/config';
import { randomUUID } from 'crypto';

const BASE_URL = process.env.DOCUMENT_STORAGE_TEST_BASE_URL ?? 'http://localhost:3000/api/v1';
const OWNER_ID = process.env.DOCUMENT_STORAGE_TEST_OWNER_ID ?? randomUUID();
const TEST_EMAIL = `document-test-${Date.now()}@nexhire.local`;
const TEST_PASSWORD = 'StrongPassword123!';
const USER_ID = process.env.DOCUMENT_STORAGE_TEST_USER_ID ?? randomUUID();
const USER_ROLE = process.env.DOCUMENT_STORAGE_TEST_USER_ROLE ?? 'CANDIDATE';
let accessToken = process.env.DOCUMENT_STORAGE_TEST_TOKEN;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

interface UploadDocumentResponse {
  id: string;
  documentType: string;
  ownerType: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  size: number;
  key: string;
  url: string;
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
  log(`✓ ${message}`, 'green');
}

function fail(message: string, data?: unknown): void {
  failed++;
  log(`✗ ${message}`, 'red');
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
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  }

  headers['x-user-id'] = USER_ID;
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
    headers: {
      'Content-Type': 'application/json',
    },
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

async function upload(
  form: FormData,
): Promise<{ status: number; data: UploadDocumentResponse; raw: unknown }> {
  const url = `${BASE_URL}/documents/upload`;
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
    data: unwrap<UploadDocumentResponse>(raw),
    raw,
  };
}

function expectStatus(
  actual: number,
  expected: number,
  label: string,
  data?: unknown,
): boolean {
  if (actual === expected) {
    pass(`${label} -> ${expected}`);
    return true;
  }

  fail(`${label}: expected ${expected}, got ${actual}`, data);
  return false;
}

function createPdfBlob(): Blob {
  return new Blob([Buffer.from('%PDF-1.4\n% NexHire test PDF\n')], {
    type: 'application/pdf',
  });
}

async function ensureGatewayIdentity(): Promise<void> {
  if (accessToken || process.env.DOCUMENT_STORAGE_TEST_USER_ID) {
    return;
  }

  logSection('0. Register document test identity');
  log(`Email: ${TEST_EMAIL}`, 'yellow');

  const response = await request<AuthResponse>('POST', '/auth/register', {
    fullName: 'Document Flow Test',
    phone: '0987654321',
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    role: USER_ROLE,
  });

  if (!expectStatus(response.status, 201, 'register document test identity', response.raw)) {
    process.exit(1);
  }

  accessToken = response.data.tokens.accessToken;
  pass('gateway identity token ready');
}

async function testUploadCvPdf(): Promise<UploadDocumentResponse | null> {
  logSection('1. Upload CV PDF');

  const form = new FormData();
  form.append('file', createPdfBlob(), 'candidate-cv.pdf');
  form.append('documentType', 'CV');
  form.append('ownerType', 'candidate');
  form.append('ownerId', OWNER_ID);

  const response = await upload(form);
  if (!expectStatus(response.status, 201, 'upload CV PDF', response.raw)) {
    return null;
  }

  const document = response.data;
  if (
    document.id &&
    document.key?.includes(`/cv/`) &&
    document.mimeType === 'application/pdf' &&
    document.ownerId === OWNER_ID &&
    document.url
  ) {
    pass('upload response contains metadata, object key, and presigned URL');
    log(`Document ID: ${document.id}`, 'dim');
    log(`Object key: ${document.key}`, 'dim');
    return document;
  }

  fail('upload response shape is invalid', response.raw);
  return null;
}

async function testMissingFileRejected(): Promise<void> {
  logSection('2. Reject missing file');

  const form = new FormData();
  form.append('documentType', 'CV');
  form.append('ownerType', 'candidate');
  form.append('ownerId', OWNER_ID);

  const response = await upload(form);
  expectStatus(response.status, 400, 'missing file rejected', response.raw);
}

async function testAvatarRejectsPdf(): Promise<void> {
  logSection('3. Reject invalid avatar MIME');

  const form = new FormData();
  form.append('file', createPdfBlob(), 'avatar.pdf');
  form.append('documentType', 'AVATAR');
  form.append('ownerType', 'candidate');
  form.append('ownerId', OWNER_ID);

  const response = await upload(form);
  expectStatus(response.status, 400, 'avatar PDF rejected', response.raw);
}

async function main(): Promise<void> {
  log('DOCUMENT STORAGE API LIVE TEST', 'cyan');
  log(`Base URL: ${BASE_URL}`, 'yellow');
  log(`Owner ID: ${OWNER_ID}`, 'yellow');

  await ensureGatewayIdentity();
  await testUploadCvPdf();
  await testMissingFileRejected();
  await testAvatarRejectsPdf();

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
