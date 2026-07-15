import 'dotenv/config';

const BASE_URL = process.env.NOTIFICATION_TEST_BASE_URL ?? 'http://localhost:3000/api/v1';
const TOKEN = process.env.NOTIFICATION_TEST_TOKEN;
const USER_ID = process.env.NOTIFICATION_TEST_USER_ID;
const USER_ROLE = process.env.NOTIFICATION_TEST_USER_ROLE ?? 'CANDIDATE';
const COMPANY_ID = process.env.NOTIFICATION_TEST_COMPANY_ID;

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

interface NotificationResponse {
  id: string;
  recipientType: string;
  recipientUserId: string | null;
  recipientCompanyId: string | null;
  readAt: string | null;
}

interface UnreadCountResponse {
  count: number;
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

function headers(): Record<string, string> {
  const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (TOKEN) {
    requestHeaders.Authorization = `Bearer ${TOKEN}`;
    return requestHeaders;
  }

  if (USER_ID) {
    requestHeaders['x-user-id'] = USER_ID;
    requestHeaders['x-user-role'] = USER_ROLE;
  }

  if (COMPANY_ID) {
    requestHeaders['x-company-id'] = COMPANY_ID;
  }

  return requestHeaders;
}

async function request<T>(
  method: string,
  path: string,
): Promise<{ status: number; data: T; raw: unknown }> {
  const url = `${BASE_URL}${path}`;
  log(`${method} ${url}`, 'blue');

  const response = await fetch(url, {
    method,
    headers: headers(),
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
  if (TOKEN || USER_ID) {
    return;
  }

  log('Missing required env: NOTIFICATION_TEST_TOKEN or NOTIFICATION_TEST_USER_ID', 'red');
  process.exit(1);
}

async function getUnreadCount(label: string): Promise<number | null> {
  logSection(label);
  const response = await request<UnreadCountResponse>('GET', '/notifications/unread-count');
  if (!expectStatus(response.status, 200, label, response.raw)) {
    return null;
  }

  if (typeof response.data.count === 'number') {
    pass('unread count response shape is valid');
    return response.data.count;
  }

  fail('unread count response shape is invalid', response.raw);
  return null;
}

async function listNotifications(): Promise<NotificationResponse[]> {
  logSection('2. List notifications');
  const response = await request<NotificationResponse[]>('GET', '/notifications?readStatus=ALL');
  if (!expectStatus(response.status, 200, 'list notifications', response.raw)) {
    return [];
  }

  if (Array.isArray(response.data)) {
    pass('notification list response shape is valid');
    return response.data;
  }

  fail('notification list is not an array after unwrap', response.raw);
  return [];
}

async function markOneRead(notifications: NotificationResponse[]): Promise<void> {
  const unread = notifications.find((notification) => !notification.readAt);
  if (!unread) {
    logSection('3. Mark one notification read');
    log('Skipped: no unread notification in current scope.', 'yellow');
    return;
  }

  logSection('3. Mark one notification read');
  const response = await request<NotificationResponse>('PATCH', `/notifications/${unread.id}/read`);
  if (!expectStatus(response.status, 200, 'mark one notification read', response.raw)) {
    return;
  }

  if (response.data.id === unread.id && response.data.readAt) {
    pass('notification readAt is set');
  } else {
    fail('mark-read response is invalid', response.raw);
  }
}

async function markAllRead(): Promise<void> {
  logSection('4. Mark all scoped notifications read');
  const response = await request<UnreadCountResponse>('PATCH', '/notifications/read-all');
  if (!expectStatus(response.status, 200, 'mark all read', response.raw)) {
    return;
  }

  if (response.data.count === 0) {
    pass('all scoped notifications are read');
  } else {
    fail('unread notifications remain after mark-all', response.raw);
  }
}

async function main(): Promise<void> {
  requireEnv();

  log('NOTIFICATION API LIVE TEST', 'cyan');
  log(`Base URL: ${BASE_URL}`, 'yellow');
  log(`Role: ${USER_ROLE}`, 'yellow');

  await getUnreadCount('1. Get unread count');
  const notifications = await listNotifications();
  await markOneRead(notifications);
  await markAllRead();
  await getUnreadCount('5. Verify unread count after mark-all');

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
