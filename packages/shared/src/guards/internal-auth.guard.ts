import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { HEADERS } from '../constants/headers';
import { AuthUser } from '../interfaces/auth-user.interface';
import { UserRole } from '../enums/user-role.enum';

/**
 * For internal services behind the gateway: builds the AuthUser from the
 * gateway-injected identity headers (x-user-id / x-user-role). Trusts the
 * internal network; the gateway is responsible for verifying the JWT.
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.headers[HEADERS.USER_ID];
    const role = request.headers[HEADERS.USER_ROLE] as UserRole;
    if (!userId || !role) {
      throw new UnauthorizedException('Missing internal identity headers');
    }

    const companyId = request.headers['x-company-id'];
    request.user = { id: userId, role, companyId } satisfies AuthUser;
    return true;
  }
}
