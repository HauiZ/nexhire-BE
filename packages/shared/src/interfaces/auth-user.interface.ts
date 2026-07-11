import { UserRole } from '../enums/user-role.enum';

/** Identity attached to a request after authentication. */
export interface AuthUser {
  id: string;
  role: UserRole;
  /** Present for RECRUITER/ADMIN bound to a company. */
  companyId?: string;
}

/** JWT access-token payload shape. */
export interface JwtPayload {
  sub: string;
  role: UserRole;
  companyId?: string;
  jti?: string;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}
