import { createHash } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@nexhire/infra';

@Injectable()
export class TokenService {
  private readonly refreshTokenPrefix = 'auth:refresh';
  private readonly tokenVersionPrefix = 'auth:token-version';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async getCurrentTokenVersion(userId: string): Promise<number> {
    const value = await this.redis.get(this.buildTokenVersionKey(userId));
    return value ? Number(value) : 0;
  }

  async storeRefreshToken(params: {
    userId: string;
    jti: string;
    refreshToken: string;
    ttlSeconds: number;
    tokenVersion: number;
  }): Promise<void> {
    await this.redis.set(
      this.buildRefreshTokenKey(params.userId, params.jti),
      JSON.stringify({
        tokenHash: this.hashToken(params.refreshToken),
        tokenVersion: params.tokenVersion,
      }),
      'EX',
      params.ttlSeconds,
    );
  }

  async validateRefreshToken(params: {
    userId: string;
    jti: string;
    refreshToken: string;
    tokenVersion: number;
  }): Promise<boolean> {
    const [storedValue, currentTokenVersion] = await Promise.all([
      this.redis.get(this.buildRefreshTokenKey(params.userId, params.jti)),
      this.getCurrentTokenVersion(params.userId),
    ]);
    if (!storedValue || currentTokenVersion !== params.tokenVersion) {
      return false;
    }

    return this.isStoredRefreshTokenValid(
      storedValue,
      params.refreshToken,
      params.tokenVersion,
    );
  }

  async consumeRefreshToken(params: {
    userId: string;
    jti: string;
    refreshToken: string;
    tokenVersion: number;
  }): Promise<boolean> {
    const key = this.buildRefreshTokenKey(params.userId, params.jti);
    const [storedValue, currentTokenVersion] = await Promise.all([
      this.redis
        .multi()
        .get(key)
        .del(key)
        .exec()
        .then((result) => result?.[0]?.[1] as string | null | undefined),
      this.getCurrentTokenVersion(params.userId),
    ]);
    if (!storedValue || currentTokenVersion !== params.tokenVersion) {
      return false;
    }

    return this.isStoredRefreshTokenValid(storedValue, params.refreshToken, params.tokenVersion);
  }

  async revokeRefreshToken(userId: string, jti: string): Promise<void> {
    await this.redis.del(this.buildRefreshTokenKey(userId, jti));
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.redis.incr(this.buildTokenVersionKey(userId));
  }

  private buildRefreshTokenKey(userId: string, jti: string): string {
    return `${this.refreshTokenPrefix}:${userId}:${jti}`;
  }

  private buildTokenVersionKey(userId: string): string {
    return `${this.tokenVersionPrefix}:${userId}`;
  }

  private isStoredRefreshTokenValid(
    storedValue: string,
    refreshToken: string,
    tokenVersion: number,
  ): boolean {
    try {
      const stored = JSON.parse(storedValue) as {
        tokenHash?: string;
        tokenVersion?: number;
      };

      return (
        stored.tokenHash === this.hashToken(refreshToken) &&
        stored.tokenVersion === tokenVersion
      );
    } catch {
      return false;
    }
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
