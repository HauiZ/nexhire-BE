import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ERROR_CODES, UserRole } from '@nexhire/shared';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { AuthService } from '../auth.service';
import { UserStatus } from '../entities/auth.enum';
import { EmailVerification } from '../entities/email-verification.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { RecruiterCompanyLink } from '../entities/recruiter-company-link.entity';
import { Role } from '../entities/role.entity';
import { UserCredential } from '../entities/user-credential.entity';
import { UserRoleEntity } from '../entities/user-role.entity';
import { User } from '../entities/user.entity';
import { AuthEventPublisher } from '../events/auth-event.publisher';
import { TokenService } from '../../token/token.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

type MockRepo = {
  findOne: jest.Mock;
  update: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

function createRepoMock(): MockRepo {
  return {
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn((entity: unknown) => entity),
    save: jest.fn(),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let dataSource: { transaction: jest.Mock };
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let configService: { get: jest.Mock };
  let authEventPublisher: {
    publishVerificationEmailRequested: jest.Mock;
    publishPasswordResetRequested: jest.Mock;
  };
  let tokenService: {
    getCurrentTokenVersion: jest.Mock;
    storeRefreshToken: jest.Mock;
    validateRefreshToken: jest.Mock;
    consumeRefreshToken: jest.Mock;
    revokeRefreshToken: jest.Mock;
    revokeAllUserRefreshTokens: jest.Mock;
  };
  let userRepo: MockRepo;
  let credentialRepo: MockRepo;
  let roleRepo: MockRepo;
  let userRoleRepo: MockRepo;
  let emailVerificationRepo: MockRepo;
  let passwordResetTokenRepo: MockRepo;
  let recruiterCompanyLinkRepo: MockRepo;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'authService.bcryptRounds': 12,
          'authService.jwt.accessSecret': 'access-secret',
          'authService.jwt.refreshSecret': 'refresh-secret',
          'authService.jwt.accessTtl': 900,
          'authService.jwt.refreshTtl': 604800,
          'authService.verification.tokenLength': 6,
          'authService.verification.tokenTtlMinutes': 15,
          'authService.verification.resendCooldownSeconds': 60,
          'authService.verification.maxResends': 5,
          'authService.passwordReset.tokenLength': 6,
          'authService.passwordReset.tokenTtlMinutes': 15,
          'authService.passwordReset.resendCooldownSeconds': 60,
          'authService.passwordReset.maxResends': 5,
        };
        return values[key] ?? fallback;
      }),
    };
    authEventPublisher = {
      publishVerificationEmailRequested: jest.fn().mockResolvedValue(undefined),
      publishPasswordResetRequested: jest.fn().mockResolvedValue(undefined),
    };
    tokenService = {
      getCurrentTokenVersion: jest.fn().mockResolvedValue(0),
      storeRefreshToken: jest.fn(),
      validateRefreshToken: jest.fn(),
      consumeRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllUserRefreshTokens: jest.fn(),
    };
    jest.restoreAllMocks();
    userRepo = createRepoMock();
    credentialRepo = createRepoMock();
    roleRepo = createRepoMock();
    userRoleRepo = createRepoMock();
    emailVerificationRepo = createRepoMock();
    passwordResetTokenRepo = createRepoMock();
    recruiterCompanyLinkRepo = createRepoMock();

    service = new AuthService(
      dataSource as unknown as DataSource,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      authEventPublisher as unknown as AuthEventPublisher,
      tokenService as unknown as TokenService,
      userRepo as unknown as Repository<User>,
      credentialRepo as unknown as Repository<UserCredential>,
      roleRepo as unknown as Repository<Role>,
      userRoleRepo as unknown as Repository<UserRoleEntity>,
      emailVerificationRepo as unknown as Repository<EmailVerification>,
      passwordResetTokenRepo as unknown as Repository<PasswordResetToken>,
      recruiterCompanyLinkRepo as unknown as Repository<RecruiterCompanyLink>,
    );
  });

  it('registers a candidate account and publishes verification email event', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue(null);
    (roleRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'role-candidate',
      name: UserRole.CANDIDATE,
    } as Role);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    jest
      .spyOn(service as never, 'generateVerificationToken' as never)
      .mockReturnValue('123456' as never);
    const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    jest
      .spyOn(service as never, 'buildVerificationExpiry' as never)
      .mockReturnValue(verificationExpiresAt as never);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const manager = {
      create: jest.fn((_: unknown, entity: unknown) => entity),
      save: jest
        .fn()
        .mockImplementationOnce(async (_entity: unknown, payload: Record<string, unknown>) => ({
          id: 'user-1',
          ...payload,
        }))
        .mockImplementation(async (_entity: unknown, payload: Record<string, unknown>) => payload),
    };
    dataSource.transaction.mockImplementation(
      async (callback: (entityManager: typeof manager) => Promise<unknown>) => callback(manager),
    );

    const result = await service.register({
      fullName: 'Nguyen Van A',
      phone: '0987654321',
      email: 'candidate@nexhire.vn',
      password: 'StrongPassword123!',
      role: UserRole.CANDIDATE,
    });

    expect(bcrypt.hash).toHaveBeenCalledWith('StrongPassword123!', 12);
    expect(manager.save).toHaveBeenNthCalledWith(
      1,
      User,
      expect.objectContaining({
        email: 'candidate@nexhire.vn',
        fullName: 'Nguyen Van A',
        phone: '0987654321',
      }),
    );
    expect(manager.save).toHaveBeenNthCalledWith(
      2,
      UserCredential,
      expect.objectContaining({
        userId: 'user-1',
        passwordHash: 'hashed-password',
      }),
    );
    expect(manager.save).toHaveBeenNthCalledWith(
      3,
      UserRoleEntity,
      expect.objectContaining({
        userId: 'user-1',
        roleId: 'role-candidate',
      }),
    );
    expect(manager.save).toHaveBeenNthCalledWith(
      4,
      EmailVerification,
      expect.objectContaining({
        userId: 'user-1',
        email: 'candidate@nexhire.vn',
        verifiedAt: null,
        resendCount: 0,
      }),
    );
    expect(authEventPublisher.publishVerificationEmailRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'candidate@nexhire.vn',
        fullName: 'Nguyen Van A',
        token: '123456',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          id: 'user-1',
          role: UserRole.CANDIDATE,
          email: 'candidate@nexhire.vn',
        }),
        tokens: expect.objectContaining({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        }),
      }),
    );
    expect(tokenService.storeRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        refreshToken: 'refresh-token',
        ttlSeconds: 604800,
        tokenVersion: 0,
      }),
    );
  });

  it('keeps registration successful when verification email event publish fails', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue(null);
    (roleRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'role-candidate',
      name: UserRole.CANDIDATE,
    } as Role);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    authEventPublisher.publishVerificationEmailRequested.mockRejectedValue(
      new Error('rabbit unavailable'),
    );
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const manager = {
      create: jest.fn((_: unknown, entity: unknown) => entity),
      save: jest
        .fn()
        .mockImplementationOnce(async (_entity: unknown, payload: Record<string, unknown>) => ({
          id: 'user-1',
          ...payload,
        }))
        .mockImplementation(async (_entity: unknown, payload: Record<string, unknown>) => payload),
    };
    dataSource.transaction.mockImplementation(
      async (callback: (entityManager: typeof manager) => Promise<unknown>) => callback(manager),
    );

    const result = await service.register({
      fullName: 'Nguyen Van A',
      phone: '0987654321',
      email: 'candidate@nexhire.vn',
      password: 'StrongPassword123!',
      role: UserRole.CANDIDATE,
    });

    expect(authEventPublisher.publishVerificationEmailRequested).toHaveBeenCalled();
    expect(result.tokens.accessToken).toBe('access-token');
    expect(result.user.email).toBe('candidate@nexhire.vn');
  });

  it('registers a recruiter account when role is requested', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue(null);
    (roleRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'role-recruiter',
      name: UserRole.RECRUITER,
    } as Role);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    jest
      .spyOn(service as never, 'generateVerificationToken' as never)
      .mockReturnValue('123456' as never);
    jest
      .spyOn(service as never, 'buildVerificationExpiry' as never)
      .mockReturnValue(new Date(Date.now() + 15 * 60 * 1000) as never);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const manager = {
      create: jest.fn((_: unknown, entity: unknown) => entity),
      save: jest
        .fn()
        .mockImplementationOnce(async (_entity: unknown, payload: Record<string, unknown>) => ({
          id: 'user-1',
          ...payload,
        }))
        .mockImplementation(async (_entity: unknown, payload: Record<string, unknown>) => payload),
    };
    dataSource.transaction.mockImplementation(
      async (callback: (entityManager: typeof manager) => Promise<unknown>) => callback(manager),
    );

    const result = await service.register({
      fullName: 'Tran Thi B',
      phone: '0987654321',
      email: 'recruiter@nexhire.vn',
      password: 'StrongPassword123!',
      role: UserRole.RECRUITER,
    });

    expect(roleRepo.findOne).toHaveBeenCalledWith({
      where: { name: UserRole.RECRUITER },
    });
    expect(manager.save).toHaveBeenNthCalledWith(
      3,
      UserRoleEntity,
      expect.objectContaining({
        userId: 'user-1',
        roleId: 'role-recruiter',
      }),
    );
    expect(result.user.role).toBe(UserRole.RECRUITER);
    expect(tokenService.storeRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        refreshToken: 'refresh-token',
      }),
    );
  });

  it('rejects register when email already exists', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({ id: 'user-1' } as User);

    await expect(
      service.register({
        fullName: 'Nguyen Van A',
        phone: '0987654321',
        email: 'candidate@nexhire.vn',
        password: 'StrongPassword123!',
        role: UserRole.CANDIDATE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(roleRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects public admin self-registration', async () => {
    await expect(
      service.register({
        fullName: 'Admin User',
        phone: '0987654321',
        email: 'admin@nexhire.vn',
        password: 'StrongPassword123!',
        role: UserRole.ADMIN as UserRole.CANDIDATE,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.AUTH.REGISTRATION_ROLE_NOT_ALLOWED,
      }),
    });
    expect(userRepo.findOne).not.toHaveBeenCalled();
    expect(roleRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects register when the requested role is not provisioned', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue(null);
    (roleRepo.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      service.register({
        fullName: 'Tran Thi B',
        phone: '0987654321',
        email: 'recruiter@nexhire.vn',
        password: 'StrongPassword123!',
        role: UserRole.RECRUITER,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.AUTH.ROLE_NOT_PROVISIONED,
      }),
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('logs in successfully and resets login state', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Nguyen Van A',
      phone: '0987654321',
      emailVerified: false,
    } as User);
    (credentialRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'credential-1',
      userId: 'user-1',
      passwordHash: 'hashed-password',
      failedLoginAttempts: 2,
      lockedUntil: null,
    } as UserCredential);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (userRoleRepo.findOne as jest.Mock).mockResolvedValue({
      userId: 'user-1',
      role: { name: UserRole.CANDIDATE },
    } as UserRoleEntity);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const manager = {
      update: jest.fn(),
    };
    dataSource.transaction.mockImplementation(
      async (callback: (entityManager: typeof manager) => Promise<unknown>) => callback(manager),
    );

    const result = await service.login({
      email: 'candidate@nexhire.vn',
      password: 'StrongPassword123!',
      role: UserRole.CANDIDATE,
    });

    expect(bcrypt.compare).toHaveBeenCalledWith('StrongPassword123!', 'hashed-password');
    expect(userRoleRepo.findOne).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        role: { name: UserRole.CANDIDATE },
      },
      relations: { role: true },
    });
    expect(manager.update).toHaveBeenNthCalledWith(1, UserCredential, 'credential-1', {
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    expect(manager.update).toHaveBeenNthCalledWith(2, User, 'user-1', {
      lastLoginAt: expect.any(Date),
    });
    expect(result.user.role).toBe(UserRole.CANDIDATE);
    expect(tokenService.storeRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        refreshToken: 'refresh-token',
      }),
    );
  });

  it('includes companyId in recruiter login tokens when company link exists', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'recruiter@nexhire.vn',
      fullName: 'Recruiter One',
      phone: '0987654321',
      emailVerified: true,
    } as User);
    (credentialRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'credential-1',
      userId: 'user-1',
      passwordHash: 'hashed-password',
      failedLoginAttempts: 0,
      lockedUntil: null,
    } as UserCredential);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (userRoleRepo.findOne as jest.Mock).mockResolvedValue({
      userId: 'user-1',
      role: { name: UserRole.RECRUITER },
    } as UserRoleEntity);
    recruiterCompanyLinkRepo.findOne.mockResolvedValue({
      userId: 'user-1',
      companyId: 'company-1',
    } as RecruiterCompanyLink);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const manager = {
      update: jest.fn(),
    };
    dataSource.transaction.mockImplementation(
      async (callback: (entityManager: typeof manager) => Promise<unknown>) => callback(manager),
    );

    const result = await service.login({
      email: 'recruiter@nexhire.vn',
      password: 'StrongPassword123!',
      role: UserRole.RECRUITER,
    });

    expect(result.user.companyId).toBe('company-1');
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sub: 'user-1',
        role: UserRole.RECRUITER,
        companyId: 'company-1',
      }),
      expect.any(Object),
    );
  });

  it('rejects login when requested role is not assigned to user', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Nguyen Van A',
      phone: '0987654321',
      emailVerified: false,
    } as User);
    (credentialRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'credential-1',
      userId: 'user-1',
      passwordHash: 'hashed-password',
      failedLoginAttempts: 0,
      lockedUntil: null,
    } as UserCredential);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (userRoleRepo.findOne as jest.Mock).mockResolvedValue(null);

    const manager = {
      update: jest.fn(),
    };
    dataSource.transaction.mockImplementation(
      async (callback: (entityManager: typeof manager) => Promise<unknown>) => callback(manager),
    );

    const loginPromise = service.login({
      email: 'candidate@nexhire.vn',
      password: 'StrongPassword123!',
      role: UserRole.RECRUITER,
    });

    await expect(loginPromise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(loginPromise).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.AUTH.LOGIN_ROLE_NOT_ALLOWED,
      }),
    });
    expect(manager.update).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
    expect(tokenService.storeRefreshToken).not.toHaveBeenCalled();
  });

  it('rejects login with invalid password and increments failed attempts', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
    } as User);
    (credentialRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'credential-1',
      userId: 'user-1',
      passwordHash: 'hashed-password',
      failedLoginAttempts: 1,
      lockedUntil: null,
    } as UserCredential);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({
        email: 'candidate@nexhire.vn',
        password: 'WrongPassword!',
        role: UserRole.CANDIDATE,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(credentialRepo.update).toHaveBeenCalledWith('credential-1', {
      failedLoginAttempts: 2,
      lockedUntil: null,
    });
  });

  it('rejects login when account is temporarily locked', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
    } as User);
    (credentialRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'credential-1',
      userId: 'user-1',
      passwordHash: 'hashed-password',
      failedLoginAttempts: 0,
      lockedUntil: new Date(Date.now() + 60_000),
    } as UserCredential);

    await expect(
      service.login({
        email: 'candidate@nexhire.vn',
        password: 'StrongPassword123!',
        role: UserRole.CANDIDATE,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.AUTH.ACCOUNT_TEMPORARILY_LOCKED,
      }),
      status: 423,
    });
  });

  it('rejects login when account is banned by admin', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      status: UserStatus.BANNED,
    } as User);

    await expect(
      service.login({
        email: 'candidate@nexhire.vn',
        password: 'StrongPassword123!',
        role: UserRole.CANDIDATE,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.AUTH.ACCOUNT_BANNED,
      }),
    });
    expect(credentialRepo.findOne).not.toHaveBeenCalled();
  });

  it('verifies email and updates both verification and user state', async () => {
    const verification = {
      id: 'verification-1',
      userId: 'user-1',
      email: 'candidate@nexhire.vn',
      tokenHash: (service as any).hashToken('123456'),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      verifiedAt: null,
      user: { id: 'user-1' },
    } as EmailVerification & { user: User };
    (emailVerificationRepo.findOne as jest.Mock).mockResolvedValue(verification);

    const manager = {
      update: jest.fn(),
    };
    dataSource.transaction.mockImplementation(
      async (callback: (entityManager: typeof manager) => Promise<void>) => callback(manager),
    );

    const result = await service.verifyEmail({
      email: 'candidate@nexhire.vn',
      token: '123456',
    });

    expect(result.message).toBe('Email verified successfully');
    expect(result.emailVerified).toBe(true);
    expect(result.email).toBe('candidate@nexhire.vn');
    expect(manager.update).toHaveBeenNthCalledWith(1, EmailVerification, 'verification-1', {
      verifiedAt: expect.any(Date),
    });
    expect(manager.update).toHaveBeenNthCalledWith(2, User, 'user-1', {
      emailVerified: true,
    });
  });

  it('returns idempotent success when email is already verified', async () => {
    const verifiedAt = new Date();
    (emailVerificationRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'verification-1',
      userId: 'user-1',
      email: 'candidate@nexhire.vn',
      tokenHash: 'ignored',
      expiresAt: new Date(Date.now() - 1000),
      verifiedAt,
      user: { id: 'user-1' },
    } as EmailVerification & { user: User });

    const result = await service.verifyEmail({
      email: 'candidate@nexhire.vn',
      token: 'wrong-token',
    });

    expect(result).toEqual({
      message: 'Email already verified',
      emailVerified: true,
      email: 'candidate@nexhire.vn',
      verifiedAt,
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('resends verification with rotated token and publish event', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Nguyen Van A',
      emailVerified: false,
    } as User);
    (emailVerificationRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'verification-1',
      userId: 'user-1',
      email: 'candidate@nexhire.vn',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      lastSentAt: new Date(Date.now() - 61 * 1000),
      resendCount: 1,
      verifiedAt: null,
    } as EmailVerification);
    jest
      .spyOn(service as never, 'generateVerificationToken' as never)
      .mockReturnValue('654321' as never);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    jest
      .spyOn(service as never, 'buildVerificationExpiry' as never)
      .mockReturnValue(expiresAt as never);

    const result = await service.resendVerification({
      email: 'candidate@nexhire.vn',
    });

    expect(emailVerificationRepo.update).toHaveBeenCalledWith('verification-1', {
      tokenHash: (service as any).hashToken('654321'),
      expiresAt,
      lastSentAt: expect.any(Date),
      resendCount: 2,
    });
    expect(authEventPublisher.publishVerificationEmailRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'candidate@nexhire.vn',
        fullName: 'Nguyen Van A',
        token: '654321',
        expiresAt: expiresAt.toISOString(),
      }),
    );
    expect(result).toEqual({
      message: 'Verification email queued successfully',
      email: 'candidate@nexhire.vn',
      resendCooldownSeconds: 60,
      resendCount: 2,
    });
  });

  it('blocks resend during cooldown window', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Nguyen Van A',
      emailVerified: false,
    } as User);
    (emailVerificationRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'verification-1',
      userId: 'user-1',
      email: 'candidate@nexhire.vn',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      lastSentAt: new Date(),
      resendCount: 1,
      verifiedAt: null,
    } as EmailVerification);

    await expect(
      service.resendVerification({
        email: 'candidate@nexhire.vn',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.AUTH.VERIFICATION_RESEND_COOLDOWN,
      }),
      status: 429,
    });
    expect(emailVerificationRepo.update).not.toHaveBeenCalled();
    expect(authEventPublisher.publishVerificationEmailRequested).not.toHaveBeenCalled();
    expect(authEventPublisher.publishPasswordResetRequested).not.toHaveBeenCalled();
  });

  it('rejects resend when email is already verified', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      emailVerified: true,
    } as User);

    await expect(
      service.resendVerification({
        email: 'candidate@nexhire.vn',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(emailVerificationRepo.findOne).not.toHaveBeenCalled();
  });

  it('returns a generic forgot-password response when email does not exist', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue(null);

    const result = await service.forgotPassword({
      email: 'missing@nexhire.vn',
    });

    expect(result).toEqual({
      message: 'Password reset code queued if the email exists',
      resendCooldownSeconds: 60,
    });
    expect(passwordResetTokenRepo.findOne).not.toHaveBeenCalled();
    expect(authEventPublisher.publishVerificationEmailRequested).not.toHaveBeenCalled();
    expect(authEventPublisher.publishPasswordResetRequested).not.toHaveBeenCalled();
  });

  it('creates a password reset token and publishes reset email event', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Nguyen Van A',
    } as User);
    (passwordResetTokenRepo.findOne as jest.Mock).mockResolvedValue(null);
    jest
      .spyOn(service as never, 'generatePasswordResetToken' as never)
      .mockReturnValue('112233' as never);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    jest
      .spyOn(service as never, 'buildPasswordResetExpiry' as never)
      .mockReturnValue(expiresAt as never);

    const result = await service.forgotPassword({
      email: 'candidate@nexhire.vn',
    });

    expect(passwordResetTokenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        email: 'candidate@nexhire.vn',
        tokenHash: (service as any).hashToken('112233'),
        expiresAt,
        usedAt: null,
        resendCount: 0,
      }),
    );
    expect(authEventPublisher.publishPasswordResetRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'candidate@nexhire.vn',
        fullName: 'Nguyen Van A',
        token: '112233',
        expiresAt: expiresAt.toISOString(),
      }),
    );
    expect(result.message).toBe('Password reset code queued if the email exists');
  });

  it('blocks forgot-password resend during cooldown window', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Nguyen Van A',
    } as User);
    (passwordResetTokenRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      email: 'candidate@nexhire.vn',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      lastSentAt: new Date(),
      resendCount: 1,
      usedAt: null,
    } as PasswordResetToken);

    await expect(
      service.forgotPassword({
        email: 'candidate@nexhire.vn',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.AUTH.PASSWORD_RESET_RESEND_COOLDOWN,
      }),
      status: 429,
    });
    expect(passwordResetTokenRepo.update).not.toHaveBeenCalled();
    expect(authEventPublisher.publishVerificationEmailRequested).not.toHaveBeenCalled();
    expect(authEventPublisher.publishPasswordResetRequested).not.toHaveBeenCalled();
  });

  it('resets password with a valid reset token', async () => {
    const resetToken = {
      id: 'reset-1',
      userId: 'user-1',
      email: 'candidate@nexhire.vn',
      tokenHash: (service as any).hashToken('112233'),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
    } as PasswordResetToken;
    (passwordResetTokenRepo.findOne as jest.Mock).mockResolvedValue(resetToken);
    (credentialRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'credential-1',
      userId: 'user-1',
      passwordHash: 'old-hash',
    } as UserCredential);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

    const manager = {
      update: jest.fn(),
    };
    dataSource.transaction.mockImplementation(
      async (callback: (entityManager: typeof manager) => Promise<void>) => callback(manager),
    );

    const result = await service.resetPassword({
      email: 'candidate@nexhire.vn',
      token: '112233',
      newPassword: 'NewStrongPassword123!',
    });

    expect(bcrypt.hash).toHaveBeenCalledWith('NewStrongPassword123!', 12);
    expect(manager.update).toHaveBeenNthCalledWith(1, PasswordResetToken, 'reset-1', {
      usedAt: expect.any(Date),
    });
    expect(manager.update).toHaveBeenNthCalledWith(
      2,
      UserCredential,
      'credential-1',
      expect.objectContaining({
        passwordHash: 'new-hash',
        failedLoginAttempts: 0,
        lockedUntil: null,
      }),
    );
    expect(tokenService.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ message: 'Password reset successfully' });
  });

  it('rejects reset password when new password matches current password', async () => {
    (passwordResetTokenRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      email: 'candidate@nexhire.vn',
      tokenHash: (service as any).hashToken('112233'),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
    } as PasswordResetToken);
    (credentialRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'credential-1',
      userId: 'user-1',
      passwordHash: 'old-hash',
    } as UserCredential);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(
      service.resetPassword({
        email: 'candidate@nexhire.vn',
        token: '112233',
        newPassword: 'SamePassword123!',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('changes password for an authenticated user', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      status: UserStatus.ACTIVE,
    } as User);
    (credentialRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'credential-1',
      userId: 'user-1',
      passwordHash: 'old-hash',
      failedLoginAttempts: 2,
      lockedUntil: new Date(),
    } as UserCredential);
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

    const result = await service.changePassword('user-1', {
      currentPassword: 'CurrentStrongPassword123!',
      newPassword: 'NewStrongPassword123!',
    });

    expect(credentialRepo.update).toHaveBeenCalledWith(
      'credential-1',
      expect.objectContaining({
        passwordHash: 'new-hash',
        failedLoginAttempts: 0,
        lockedUntil: null,
      }),
    );
    expect(tokenService.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ message: 'Password changed successfully' });
  });

  it('rejects change password when current password is invalid', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      status: UserStatus.ACTIVE,
    } as User);
    (credentialRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'credential-1',
      userId: 'user-1',
      passwordHash: 'old-hash',
    } as UserCredential);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.changePassword('user-1', {
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewStrongPassword123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(credentialRepo.update).not.toHaveBeenCalled();
  });

  it('refreshes token pair with refresh token rotation', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      role: UserRole.CANDIDATE,
      jti: 'old-jti',
      tokenVersion: 0,
    });
    tokenService.consumeRefreshToken.mockResolvedValue(true);
    (userRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Nguyen Van A',
      phone: '0987654321',
      emailVerified: true,
    } as User);
    (userRoleRepo.findOne as jest.Mock).mockResolvedValue({
      userId: 'user-1',
      role: { name: UserRole.CANDIDATE },
    } as UserRoleEntity);
    jwtService.signAsync
      .mockResolvedValueOnce('new-access-token')
      .mockResolvedValueOnce('new-refresh-token');

    const result = await service.refreshToken({
      refreshToken: 'old-refresh-token',
    });

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('old-refresh-token', {
      secret: 'refresh-secret',
    });
    expect(tokenService.consumeRefreshToken).toHaveBeenCalledWith({
      userId: 'user-1',
      jti: 'old-jti',
      refreshToken: 'old-refresh-token',
      tokenVersion: 0,
    });
    expect(userRoleRepo.findOne).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        role: { name: UserRole.CANDIDATE },
      },
      relations: { role: true },
    });
    expect(tokenService.revokeRefreshToken).not.toHaveBeenCalled();
    expect(tokenService.storeRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        refreshToken: 'new-refresh-token',
        tokenVersion: 0,
      }),
    );
    expect(result.tokens).toEqual(
      expect.objectContaining({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      }),
    );
    expect(result.user.role).toBe(UserRole.CANDIDATE);
  });

  it('rejects refresh when token is not found in Redis', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      role: UserRole.CANDIDATE,
      jti: 'old-jti',
      tokenVersion: 0,
    });
    tokenService.consumeRefreshToken.mockResolvedValue(false);

    await expect(
      service.refreshToken({
        refreshToken: 'old-refresh-token',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokenService.revokeRefreshToken).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('logs out by revoking the current refresh token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      role: UserRole.CANDIDATE,
      jti: 'refresh-jti',
      tokenVersion: 0,
    });

    const result = await service.logout({
      refreshToken: 'refresh-token',
    });

    expect(tokenService.revokeRefreshToken).toHaveBeenCalledWith('user-1', 'refresh-jti');
    expect(result).toEqual({ message: 'Logged out successfully' });
  });

  it('returns current user header profile from the latest auth user record', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Nguyen Minh Khoa',
      avatarUrl: 'https://cdn.nexhire.vn/avatar/user-1.png',
    } as User);
    userRoleRepo.findOne.mockResolvedValue({
      role: { name: UserRole.CANDIDATE },
    } as UserRoleEntity);

    const result = await service.getMe({
      id: 'user-1',
      role: UserRole.CANDIDATE,
    });

    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(userRoleRepo.findOne).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        role: { name: UserRole.CANDIDATE },
      },
      relations: { role: true },
    });
    expect(result).toEqual({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Nguyen Minh Khoa',
      role: UserRole.CANDIDATE,
      logoUrl: 'https://cdn.nexhire.vn/avatar/user-1.png',
      logoDocumentId: null,
    });
  });

  it('returns company logo for recruiter header profile', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'recruiter@nexhire.vn',
      fullName: 'Recruiter One',
      avatarUrl: 'https://cdn.nexhire.vn/avatar/recruiter.png',
    } as User);
    userRoleRepo.findOne.mockResolvedValue({
      role: { name: UserRole.RECRUITER },
    } as UserRoleEntity);
    recruiterCompanyLinkRepo.findOne.mockResolvedValue({
      companyLogoUrl: 'https://cdn.nexhire.vn/company/logo.png',
      companyLogoDocumentId: '00000000-0000-4000-8000-000000000099',
    } as RecruiterCompanyLink);

    const result = await service.getMe({
      id: 'user-1',
      role: UserRole.RECRUITER,
    });

    expect(recruiterCompanyLinkRepo.findOne).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(result).toEqual({
      id: 'user-1',
      email: 'recruiter@nexhire.vn',
      fullName: 'Recruiter One',
      role: UserRole.RECRUITER,
      logoUrl: 'https://cdn.nexhire.vn/company/logo.png',
      logoDocumentId: '00000000-0000-4000-8000-000000000099',
    });
  });

  it('rejects current user header profile when token role is no longer assigned', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Nguyen Minh Khoa',
      avatarUrl: null,
    } as User);
    userRoleRepo.findOne.mockResolvedValue(null);

    await expect(
      service.getMe({
        id: 'user-1',
        role: UserRole.RECRUITER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a user contact snapshot for internal service calls', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Nguyen Van A',
    } as User);

    const result = await service.getUserContactSnapshot('user-1');

    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(result).toEqual({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Nguyen Van A',
    });
  });

  it('returns not found for a missing user contact snapshot', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await expect(service.getUserContactSnapshot('missing-user')).rejects.toMatchObject({
      status: 404,
      response: expect.objectContaining({
        code: ERROR_CODES.AUTH.USER_NOT_FOUND,
      }),
    });
  });
});
