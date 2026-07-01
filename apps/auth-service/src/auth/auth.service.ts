import { createHash, randomInt } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ERROR_CODES, JwtPayload, UserRole } from '@nexhire/shared';
import * as bcrypt from 'bcrypt';
import { EventPublisher } from '@nexhire/infra';
import { EVENTS } from '@nexhire/shared';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResendVerificationResponseDto } from './dto/resend-verification-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyEmailResponseDto } from './dto/verify-email-response.dto';
import { PasswordAlgorithm, UserStatus } from './entities/auth.enum';
import { EmailVerification } from './entities/email-verification.entity';
import { Role } from './entities/role.entity';
import { UserCredential } from './entities/user-credential.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { User } from './entities/user.entity';

@Injectable()
export class AuthService {
  private static readonly HTTP_STATUS_LOCKED = 423;
  private readonly maxFailedLoginAttempts = 5;
  private readonly lockDurationMinutes = 15;

  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventPublisher: EventPublisher,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserCredential)
    private readonly credentialRepo: Repository<UserCredential>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(EmailVerification)
    private readonly emailVerificationRepo: Repository<EmailVerification>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const fullName = dto.fullName.trim();
    const phone = dto.phone.trim();
    const email = dto.email.trim().toLowerCase();
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: 'Email is already registered',
      });
    }

    const candidateRole = await this.roleRepo.findOne({
      where: { name: UserRole.CANDIDATE },
    });
    if (!candidateRole) {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: 'Candidate role is not provisioned',
      });
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      this.configService.get<number>('authService.bcryptRounds', 12),
    );

    const verificationToken = this.generateVerificationToken();
    const verificationExpiresAt = this.buildVerificationExpiry();
    const user = await this.dataSource.transaction(async (manager) => {
      const createdUser = await manager.save(
        User,
        manager.create(User, {
          email,
          phone,
          fullName,
          avatarUrl: null,
          status: UserStatus.ACTIVE,
          emailVerified: false,
          lastLoginAt: null,
        }),
      );

      await manager.save(
        UserCredential,
        manager.create(UserCredential, {
          userId: createdUser.id,
          passwordHash,
          passwordAlgorithm: PasswordAlgorithm.BCRYPT,
          passwordUpdatedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      );

      await manager.save(
        UserRoleEntity,
        manager.create(UserRoleEntity, {
          userId: createdUser.id,
          roleId: candidateRole.id,
        }),
      );

      await manager.save(
        EmailVerification,
        manager.create(EmailVerification, {
          userId: createdUser.id,
          email,
          tokenHash: this.hashToken(verificationToken),
          expiresAt: verificationExpiresAt,
          verifiedAt: null,
          lastSentAt: new Date(),
          resendCount: 0,
        }),
      );

      return createdUser;
    });

    await this.publishVerificationEmail(email, fullName, verificationToken, verificationExpiresAt);
    return this.buildAuthResponse(user, UserRole.CANDIDATE);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      throw this.invalidCredentials();
    }

    const credential = await this.credentialRepo.findOne({ where: { userId: user.id } });
    if (!credential) {
      throw this.invalidCredentials();
    }

    if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()) {
      throw new HttpException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Account is temporarily locked',
      }, AuthService.HTTP_STATUS_LOCKED);
    }

    const isPasswordValid = await bcrypt.compare(dto.password, credential.passwordHash);
    if (!isPasswordValid) {
      await this.recordFailedLogin(credential);
      throw this.invalidCredentials();
    }

    await this.resetLoginState(user.id, credential.id);
    const primaryRole = await this.resolvePrimaryRole(user.id);
    return this.buildAuthResponse(user, primaryRole);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<VerifyEmailResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const verification = await this.emailVerificationRepo.findOne({
      where: { email },
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });

    if (!verification?.user) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Email verification request was not found',
      });
    }

    if (verification.verifiedAt) {
      return {
        message: 'Email already verified',
        emailVerified: true,
        email: verification.email,
        verifiedAt: verification.verifiedAt,
      };
    }

    if (verification.tokenHash !== this.hashToken(dto.token.trim())) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Email verification token is invalid',
      });
    }

    if (verification.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Email verification token has expired',
      });
    }

    const verifiedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.update(EmailVerification, verification.id, {
        verifiedAt,
      });
      await manager.update(User, verification.userId, {
        emailVerified: true,
      });
    });

    return {
      message: 'Email verified successfully',
      emailVerified: true,
      email: verification.email,
      verifiedAt,
    };
  }

  async resendVerification(dto: ResendVerificationDto): Promise<ResendVerificationResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'User was not found',
      });
    }

    if (user.emailVerified) {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: 'Email is already verified',
      });
    }

    const verification = await this.emailVerificationRepo.findOne({
      where: { userId: user.id, verifiedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    if (!verification) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Email verification request was not found',
      });
    }

    this.assertResendAllowed(verification);

    const token = this.generateVerificationToken();
    const expiresAt = this.buildVerificationExpiry();
    const sentAt = new Date();
    const resendCount = verification.resendCount + 1;

    await this.emailVerificationRepo.update(verification.id, {
      tokenHash: this.hashToken(token),
      expiresAt,
      lastSentAt: sentAt,
      resendCount,
    });

    await this.publishVerificationEmail(email, user.fullName, token, expiresAt);

    return {
      message: 'Verification email queued successfully',
      email,
      resendCooldownSeconds: this.getVerificationConfig().resendCooldownSeconds,
      resendCount,
    };
  }

  private async resolvePrimaryRole(userId: string): Promise<UserRole> {
    const userRole = await this.userRoleRepo.findOne({
      where: { userId },
      relations: { role: true },
    });
    if (!userRole?.role?.name) {
      throw this.invalidCredentials();
    }
    return userRole.role.name;
  }

  private async buildAuthResponse(user: User, role: UserRole): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('authService.jwt.accessSecret'),
      expiresIn: this.configService.get<number>('authService.jwt.accessTtl'),
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('authService.jwt.refreshSecret'),
      expiresIn: this.configService.get<number>('authService.jwt.refreshTtl'),
    });

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role,
        emailVerified: user.emailVerified,
      },
      tokens: {
        accessToken,
        refreshToken,
        accessTokenExpiresIn: this.configService.get<number>('authService.jwt.accessTtl', 900),
        refreshTokenExpiresIn: this.configService.get<number>('authService.jwt.refreshTtl', 604800),
      },
    };
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: 'Invalid email or password',
    });
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private generateVerificationToken(): string {
    const { tokenLength } = this.getVerificationConfig();
    const min = 10 ** (tokenLength - 1);
    const max = 10 ** tokenLength;
    return `${randomInt(min, max)}`;
  }

  private buildVerificationExpiry(): Date {
    const { tokenTtlMinutes } = this.getVerificationConfig();
    return new Date(Date.now() + tokenTtlMinutes * 60 * 1000);
  }

  private assertResendAllowed(verification: EmailVerification): void {
    const { resendCooldownSeconds, maxResends } = this.getVerificationConfig();
    const now = Date.now();

    if (verification.expiresAt.getTime() <= now) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Current verification token has expired',
      });
    }

    if (verification.resendCount >= maxResends) {
      throw new HttpException({
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Verification resend limit reached',
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const earliestNextResend = verification.lastSentAt.getTime() + resendCooldownSeconds * 1000;
    if (earliestNextResend > now) {
      throw new HttpException({
        code: ERROR_CODES.RATE_LIMITED,
        message: `Please wait ${Math.ceil((earliestNextResend - now) / 1000)} seconds before resending`,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async publishVerificationEmail(
    email: string,
    fullName: string | null,
    token: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.eventPublisher.publish(EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED, {
      email,
      fullName,
      token,
      expiresAt: expiresAt.toISOString(),
    });
  }

  private getVerificationConfig(): {
    tokenLength: number;
    tokenTtlMinutes: number;
    resendCooldownSeconds: number;
    maxResends: number;
  } {
    return {
      tokenLength: this.configService.get<number>('authService.verification.tokenLength', 6),
      tokenTtlMinutes: this.configService.get<number>('authService.verification.tokenTtlMinutes', 15),
      resendCooldownSeconds: this.configService.get<number>(
        'authService.verification.resendCooldownSeconds',
        60,
      ),
      maxResends: this.configService.get<number>('authService.verification.maxResends', 5),
    };
  }

  private async recordFailedLogin(credential: UserCredential): Promise<void> {
    const nextAttempts = credential.failedLoginAttempts + 1;
    const lockedUntil =
      nextAttempts >= this.maxFailedLoginAttempts
        ? new Date(Date.now() + this.lockDurationMinutes * 60 * 1000)
        : null;

    await this.credentialRepo.update(credential.id, {
      failedLoginAttempts: nextAttempts >= this.maxFailedLoginAttempts ? 0 : nextAttempts,
      lockedUntil,
    });
  }

  private async resetLoginState(userId: string, credentialId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(UserCredential, credentialId, {
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
      await manager.update(User, userId, {
        lastLoginAt: new Date(),
      });
    });
  }
}
