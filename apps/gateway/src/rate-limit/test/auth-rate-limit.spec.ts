import {
  AUTH_RATE_LIMIT_RULES,
  buildGatewayThrottlers,
  isRateLimitRuleMatch,
  normalizeGatewayPath,
} from '../auth-rate-limit';

describe('gateway auth rate limit rules', () => {
  it('normalizes gateway API prefix and query string', () => {
    expect(normalizeGatewayPath('/api/v1/auth/login?next=/jobs')).toBe('/auth/login');
    expect(normalizeGatewayPath('/auth/login/')).toBe('/auth/login');
  });

  it('matches sensitive auth endpoints by method and path', () => {
    const loginRule = AUTH_RATE_LIMIT_RULES.find((rule) => rule.name === 'auth-login');

    expect(loginRule).toBeDefined();
    expect(
      isRateLimitRuleMatch(
        {
          method: 'POST',
          originalUrl: '/api/v1/auth/login',
        },
        loginRule!,
      ),
    ).toBe(true);
    expect(
      isRateLimitRuleMatch(
        {
          method: 'GET',
          originalUrl: '/api/v1/auth/login',
        },
        loginRule!,
      ),
    ).toBe(false);
  });

  it('builds global and per-auth throttlers', () => {
    const throttlers = buildGatewayThrottlers();

    expect(throttlers.map((throttler) => throttler.name)).toEqual([
      'global',
      ...AUTH_RATE_LIMIT_RULES.map((rule) => rule.name),
    ]);
  });
});
