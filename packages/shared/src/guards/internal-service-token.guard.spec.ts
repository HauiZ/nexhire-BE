import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { HEADERS } from '../constants/headers';
import { InternalServiceTokenGuard } from './internal-service-token.guard';

function createContext(token?: string): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn(() => ({
      getRequest: jest.fn(() => ({
        headers: token ? { [HEADERS.INTERNAL_SERVICE_TOKEN]: token } : {},
      })),
    })),
  } as unknown as ExecutionContext;
}

describe('InternalServiceTokenGuard', () => {
  it('allows requests with the configured internal token', () => {
    const guard = new InternalServiceTokenGuard(
      { get: jest.fn().mockReturnValue('secret') } as unknown as ConfigService,
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector,
    );

    expect(guard.canActivate(createContext('secret'))).toBe(true);
  });

  it('rejects requests without the configured internal token', () => {
    const guard = new InternalServiceTokenGuard(
      { get: jest.fn().mockReturnValue('secret') } as unknown as ConfigService,
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector,
    );

    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
  });
});
