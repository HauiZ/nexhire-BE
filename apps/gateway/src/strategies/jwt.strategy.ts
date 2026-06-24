import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, JwtPayload } from '@nexhire/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('gateway.jwt.accessSecret') as string,
    });
  }

  /** Return value becomes request.user. */
  validate(payload: JwtPayload): AuthUser {
    return { id: payload.sub, role: payload.role, companyId: payload.companyId };
  }
}
