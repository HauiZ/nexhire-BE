import { createHash, randomUUID } from 'crypto';
import {
  ConflictException,
  Injectable,
  LockedException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ERROR_CODES, JwtPayload, UserRole } from '@nexhire/shared';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { EmailVerification } from './entities/email-verification.entity';
import { Role } from './entities/role.entity';
import { UserCredential } from './entities/user-credential.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { User } from './entities/user.entity';

@Injectable()
export class AuthService {
  private readonly maxFailedLoginAttempts = 5;
  private readonly lockDurationMinutes = 15;

  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

    const user = await this.dataSource.transaction(async (manager) => {
      const createdUser = await manager.save(
        User,
        manager.create(User, {
          email,
          phone,
          fullName,
          avatarUrl: null,
          status: 'ACTIVE',
          emailVerified: false,
          lastLoginAt: null,
        }),
      );

      await manager.save(
        UserCredential,
        manager.create(UserCredential, {
          userId: createdUser.id,
          passwordHash,
          passwordAlgorithm: 'bcrypt',
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

      const verificationToken = randomUUID().replace(/-/g, '');
      await manager.save(
        EmailVerification,
        manager.create(EmailVerification, {
          userId: createdUser.id,
          email,
          tokenHash: this.hashToken(verificationToken),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          verifiedAt: null,
        }),
      );

      return createdUser;
    });

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
      throw new LockedException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Account is temporarily locked',
      });
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

  private async resolvePrimaryRole(userId: string): Promise<UserRole> {
    const userRole = await this.userRoleRepo.findOne({
      where: { userId },
      relations: { role: true },
    });
    if (!userRole?.role?.name) {
      throw this.invalidCredentials();
    }
    return userRole.role.name as UserRole;
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
