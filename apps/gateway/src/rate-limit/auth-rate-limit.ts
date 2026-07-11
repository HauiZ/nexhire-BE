import { ExecutionContext } from '@nestjs/common';
import { ThrottlerOptions } from '@nestjs/throttler';

type AuthRateLimitRule = {
  name: string;
  method: string;
  path: string;
  ttl: number;
  limit: number;
};

export const GLOBAL_RATE_LIMIT: ThrottlerOptions = {
  name: 'global',
  ttl: 60_000,
  limit: 100,
};

export const AUTH_RATE_LIMIT_RULES: AuthRateLimitRule[] = [
  {
    name: 'auth-login',
    method: 'POST',
    path: '/auth/login',
    ttl: 60_000,
    limit: 5,
  },
  {
    name: 'auth-register',
    method: 'POST',
    path: '/auth/register',
    ttl: 60_000,
    limit: 5,
  },
  {
    name: 'auth-refresh',
    method: 'POST',
    path: '/auth/refresh',
    ttl: 60_000,
    limit: 20,
  },
  {
    name: 'auth-forgot-password',
    method: 'POST',
    path: '/auth/forgot-password',
    ttl: 60_000,
    limit: 3,
  },
  {
    name: 'auth-resend-verification',
    method: 'POST',
    path: '/auth/resend-verification',
    ttl: 60_000,
    limit: 3,
  },
  {
    name: 'auth-reset-password',
    method: 'POST',
    path: '/auth/reset-password',
    ttl: 60_000,
    limit: 5,
  },
];

export function normalizeGatewayPath(value: string | undefined): string {
  const path = (value ?? '').split('?')[0].replace(/\/+$/, '');
  return path.replace(/^\/api\/v1(?=\/|$)/, '') || '/';
}

export function isRateLimitRuleMatch(
  request: { method?: string; originalUrl?: string; url?: string },
  rule: AuthRateLimitRule,
): boolean {
  return (
    request.method?.toUpperCase() === rule.method &&
    normalizeGatewayPath(request.originalUrl ?? request.url) === rule.path
  );
}

export function buildGatewayThrottlers(): ThrottlerOptions[] {
  return [
    GLOBAL_RATE_LIMIT,
    ...AUTH_RATE_LIMIT_RULES.map((rule) => ({
      name: rule.name,
      ttl: rule.ttl,
      limit: rule.limit,
      skipIf: (context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest();
        return !isRateLimitRuleMatch(request, rule);
      },
    })),
  ];
}
