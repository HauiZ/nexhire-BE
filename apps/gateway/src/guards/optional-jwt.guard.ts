import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Gateway-level auth: if a valid JWT is present, attach the user (so identity
 * headers can be forwarded). If absent/invalid, let the request through —
 * the target internal service decides whether the route requires auth.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Override so a missing/invalid token does NOT reject the request.
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    return (user ?? null) as TUser;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // ignore — optional auth
    }
    return true;
  }
}
