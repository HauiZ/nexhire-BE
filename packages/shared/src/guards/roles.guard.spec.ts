import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../enums/user-role.enum';

function makeContext(user: unknown): ExecutionContext {
  return {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function makeReflector(required: UserRole[] | undefined): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows the request when no roles are required', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    const ctx = makeContext({ id: '1', role: UserRole.CANDIDATE });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows the request when the user has a required role', () => {
    const guard = new RolesGuard(makeReflector([UserRole.RECRUITER]));
    const ctx = makeContext({ id: '1', role: UserRole.RECRUITER });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('forbids the request when the user lacks the required role', () => {
    const guard = new RolesGuard(makeReflector([UserRole.ADMIN]));
    const ctx = makeContext({ id: '1', role: UserRole.CANDIDATE });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('forbids the request when there is no authenticated user', () => {
    const guard = new RolesGuard(makeReflector([UserRole.CANDIDATE]));
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
