import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { HEADERS } from '../constants/headers';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class InternalServiceTokenGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const expectedToken = this.configService.get<string>('INTERNAL_SERVICE_TOKEN');
    const request = context.switchToHttp().getRequest();
    const providedToken = request.headers[HEADERS.INTERNAL_SERVICE_TOKEN];

    if (!expectedToken || providedToken !== expectedToken) {
      throw new UnauthorizedException('Invalid internal service token');
    }
    return true;
  }
}
