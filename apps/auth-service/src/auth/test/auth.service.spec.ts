import { ConflictException, HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EventPublisher } from '@nexhire/infra';
import { ERROR_CODES, UserRole } from '@nexhire/shared';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { AuthService } from '../auth.service';
import { EmailVerification } from '../entities/email-verification.entity';
import { Role } from '../entities/role.entity';
import { UserCredential } from '../entities/user-credential.entity';
import { UserRoleEntity } from '../entities/user-role.entity';
import { User } from '../entities/user.entity';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

type MockRepo = {
  findOne: jest.Mock;
  update: jest.Mock;
};

function createRepoMock(): MockRepo {
  return {
    findOne: jest.fn(),
    update: jest.fn(),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let dataSource: { transaction: jest.Mock };
  let jwtService: { signAsync: jest.Mock };
  let configService: { get: jest.Mock };
  let eventPublisher: { publish: jest.Mock };
  let userRepo: MockRepo;
  let credentialRepo: MockRepo;
  let roleRepo: MockRepo;
  let userRoleRepo: MockRepo;
  let emailVerificationRepo: MockRepo;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn(),
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
        };
        return values[key] ?? fallback;
      }),
    };
    eventPublisher = {
      publish: jest.fn(),
    };
    jest.restoreAllMocks();
    userRepo = createRepoMock();
    credentialRepo = createRepoMock();
    roleRepo = createRepoMock();
    userRoleRepo = createRepoMock();
    emailVerificationRepo = createRepoMock();

    service = new AuthService(
      dataSource as unknown as DataSource,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      eventPublisher as unknown as EventPublisher,
      userRepo as unknown as Repository<User>,
      credentialRepo as unknown as Repository<UserCredential>,
      roleRepo as unknown as Repository<Role>,
      userRoleRepo as unknown as Repository<UserRoleEntity>,
      emailVerificationRepo as unknown as Repository<EmailVerification>,
    );
  });

  it('registers a candidate account and publishes verification email event', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue(null);
    (roleRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'role-candidate',
      name: UserRole.CANDIDATE,
    } as Role);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    jest.spyOn(service as never, 'generateVerificationToken' as never).mockReturnValue('123456' as never);
    const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    jest
      .spyOn(service as never, 'buildVerificationExpiry' as never)
      .mockReturnValue(verificationExpiresAt as never);
    jwtService.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');

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
    dataSource.transaction.mockImplementation(async (callback: (entityManager: typeof manager) => Promise<unknown>) =>
      callback(manager),
    );

    const result = await service.register({
      fullName: 'Nguyen Van A',
      phone: '0987654321',
      email: 'candidate@nexhire.vn',
      password: 'StrongPassword123!',
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
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'auth.email-verification-requested',
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
  });

  it('rejects register when email already exists', async () => {
    (userRepo.findOne as jest.Mock).mockResolvedValue({ id: 'user-1' } as User);

    await expect(
      service.register({
        fullName: 'Nguyen Van A',
        phone: '0987654321',
        email: 'candidate@nexhire.vn',
        password: 'StrongPassword123!',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(roleRepo.findOne).not.toHaveBeenCalled();
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
    jwtService.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');

    const manager = {
      update: jest.fn(),
    };
    dataSource.transaction.mockImplementation(async (callback: (entityManager: typeof manager) => Promise<unknown>) =>
      callback(manager),
    );

    const result = await service.login({
      email: 'candidate@nexhire.vn',
      password: 'StrongPassword123!',
    });

    expect(bcrypt.compare).toHaveBeenCalledWith('StrongPassword123!', 'hashed-password');
    expect(manager.update).toHaveBeenNthCalledWith(1, UserCredential, 'credential-1', {
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    expect(manager.update).toHaveBeenNthCalledWith(2, User, 'user-1', {
      lastLoginAt: expect.any(Date),
    });
    expect(result.user.role).toBe(UserRole.CANDIDATE);
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
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.FORBIDDEN,
      }),
      status: 423,
    });
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
    dataSource.transaction.mockImplementation(async (callback: (entityManager: typeof manager) => Promise<void>) =>
      callback(manager),
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
    jest.spyOn(service as never, 'generateVerificationToken' as never).mockReturnValue('654321' as never);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    jest.spyOn(service as never, 'buildVerificationExpiry' as never).mockReturnValue(expiresAt as never);

    const result = await service.resendVerification({
      email: 'candidate@nexhire.vn',
    });

    expect(emailVerificationRepo.update).toHaveBeenCalledWith('verification-1', {
      tokenHash: (service as any).hashToken('654321'),
      expiresAt,
      lastSentAt: expect.any(Date),
      resendCount: 2,
    });
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'auth.email-verification-requested',
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
        code: ERROR_CODES.RATE_LIMITED,
      }),
      status: 429,
    });
    expect(emailVerificationRepo.update).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
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
});
