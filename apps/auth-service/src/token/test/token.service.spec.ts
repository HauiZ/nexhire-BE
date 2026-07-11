import { Redis } from 'ioredis';
import { TokenService } from '../token.service';

type MockRedis = {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  incr: jest.Mock;
  multi: jest.Mock;
};

function createRedisMock(): MockRedis {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    multi: jest.fn(),
  };
}

describe('TokenService', () => {
  let service: TokenService;
  let redis: MockRedis;

  beforeEach(() => {
    redis = createRedisMock();
    service = new TokenService(redis as unknown as Redis);
  });

  it('stores refresh token as a hashed value with TTL', async () => {
    await service.storeRefreshToken({
      userId: 'user-1',
      jti: 'jti-1',
      refreshToken: 'refresh-token',
      ttlSeconds: 604800,
      tokenVersion: 0,
    });

    expect(redis.set).toHaveBeenCalledWith(
      'auth:refresh:user-1:jti-1',
      expect.stringContaining('"tokenVersion":0'),
      'EX',
      604800,
    );
    const storedValue = redis.set.mock.calls[0][1] as string;
    expect(storedValue).not.toContain('refresh-token');
  });

  it('atomically consumes a valid refresh token', async () => {
    await service.storeRefreshToken({
      userId: 'user-1',
      jti: 'jti-1',
      refreshToken: 'refresh-token',
      ttlSeconds: 604800,
      tokenVersion: 0,
    });
    const storedValue = redis.set.mock.calls[0][1] as string;
    redis.get.mockResolvedValue('0');
    redis.multi.mockReturnValue({
      get: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, storedValue], [null, 1]]),
    });

    const result = await service.consumeRefreshToken({
      userId: 'user-1',
      jti: 'jti-1',
      refreshToken: 'refresh-token',
      tokenVersion: 0,
    });

    expect(result).toBe(true);
    expect(redis.multi).toHaveBeenCalled();
  });

  it('rejects corrupted Redis token payloads without throwing', async () => {
    redis.get.mockResolvedValue('0');
    redis.multi.mockReturnValue({
      get: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, '{bad-json'], [null, 1]]),
    });

    await expect(
      service.consumeRefreshToken({
        userId: 'user-1',
        jti: 'jti-1',
        refreshToken: 'refresh-token',
        tokenVersion: 0,
      }),
    ).resolves.toBe(false);
  });
});
