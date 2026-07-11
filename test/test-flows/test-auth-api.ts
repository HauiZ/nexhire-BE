import 'dotenv/config';

const BASE_URL = process.env.AUTH_TEST_BASE_URL ?? 'http://localhost:3001';
const TEST_EMAIL = `auth-test-${Date.now()}@nexhire.local`;
const TEST_PASSWORD = 'StrongPassword123!';
const NEW_PASSWORD = 'NewStrongPassword123!';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

interface AuthResponse {
  user: {
    id: string;
    email: string;
    role: string;
    fullName: string | null;
    phone: string | null;
    emailVerified: boolean;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresIn: number;
    refreshTokenExpiresIn: number;
  };
}

interface ApiEnvelope<T> {
  data?: T;
  code?: string;
  message?: string;
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

async function request<T>(
  method: string,
  path: string,
  options: {
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; data: T; raw: unknown }> {
  const url = `${BASE_URL}${path}`;
  log(`${method} ${url}`, 'blue');

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const raw = text ? JSON.parse(text) : {};
  return {
    status: response.status,
    data: unwrap<T>(raw),
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

async function register(): Promise<AuthResponse | null> {
  logSection('1. Register candidate');
  log(`Email: ${TEST_EMAIL}`, 'yellow');

  const response = await request<AuthResponse>('POST', '/auth/register', {
    body: {
      fullName: 'Auth Flow Test',
      phone: '0987654321',
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
  });

  if (!expectStatus(response.status, 201, 'register', response.raw)) {
    return null;
  }

  if (response.data.user?.id && response.data.tokens?.accessToken) {
    pass('register returns user and token pair');
    return response.data;
  }

  fail('register response shape is invalid', response.raw);
  return null;
}

async function registerDuplicate(): Promise<void> {
  logSection('2. Duplicate register');
  const response = await request<unknown>('POST', '/auth/register', {
    body: {
      fullName: 'Auth Flow Test',
      phone: '0987654321',
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
  });

  expectStatus(response.status, 409, 'duplicate register rejected', response.raw);
}

async function login(password = TEST_PASSWORD, expectedStatus = 200): Promise<AuthResponse | null> {
  logSection(`Login with ${password === TEST_PASSWORD ? 'current' : 'changed/wrong'} password`);
  const response = await request<AuthResponse>('POST', '/auth/login', {
    body: {
      email: TEST_EMAIL,
      password,
    },
  });

  if (!expectStatus(response.status, expectedStatus, 'login', response.raw)) {
    return null;
  }

  if (expectedStatus !== 200) {
    return null;
  }

  if (response.data.user?.id && response.data.tokens?.refreshToken) {
    pass('login returns user and token pair');
    return response.data;
  }

  fail('login response shape is invalid', response.raw);
  return null;
}

async function refresh(refreshToken: string, expectedStatus = 200): Promise<AuthResponse | null> {
  logSection('Refresh token');
  const response = await request<AuthResponse>('POST', '/auth/refresh', {
    body: { refreshToken },
  });

  if (!expectStatus(response.status, expectedStatus, 'refresh', response.raw)) {
    return null;
  }

  return expectedStatus === 200 ? response.data : null;
}

async function logout(refreshToken: string): Promise<void> {
  logSection('Logout');
  const response = await request<unknown>('POST', '/auth/logout', {
    body: { refreshToken },
  });

  expectStatus(response.status, 200, 'logout', response.raw);
}

async function changePassword(user: AuthResponse['user']): Promise<void> {
  logSection('Change password');
  const response = await request<unknown>('POST', '/auth/change-password', {
    headers: {
      'x-user-id': user.id,
      'x-user-role': user.role,
    },
    body: {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    },
  });

  expectStatus(response.status, 200, 'change password', response.raw);
}

async function forgotPassword(): Promise<void> {
  logSection('Forgot password');
  const response = await request<unknown>('POST', '/auth/forgot-password', {
    body: { email: TEST_EMAIL },
  });

  expectStatus(response.status, 200, 'forgot password', response.raw);
}

async function main(): Promise<void> {
  log('AUTH API LIVE TEST', 'cyan');
  log(`Base URL: ${BASE_URL}`, 'yellow');

  const registered = await register();
  if (!registered) {
    process.exit(1);
  }

  await registerDuplicate();
  await login('WrongPassword123!', 401);

  const loginResponse = await login();
  if (!loginResponse) {
    process.exit(1);
  }

  const refreshed = await refresh(loginResponse.tokens.refreshToken);
  if (refreshed) {
    if (refreshed.tokens.accessToken !== loginResponse.tokens.accessToken) {
      pass('access token rotates on refresh');
    } else {
      fail('access token did not rotate on refresh');
    }

    if (refreshed.tokens.refreshToken !== loginResponse.tokens.refreshToken) {
      pass('refresh token rotates on refresh');
    } else {
      fail('refresh token did not rotate on refresh');
    }

    await logout(refreshed.tokens.refreshToken);
    await refresh(refreshed.tokens.refreshToken, 401);
  }

  const changePasswordLogin = await login();
  if (changePasswordLogin) {
    await changePassword(changePasswordLogin.user);
    await login(TEST_PASSWORD, 401);
    await login(NEW_PASSWORD, 200);
  }

  await forgotPassword();

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
