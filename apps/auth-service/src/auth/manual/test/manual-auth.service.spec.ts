import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODES } from '@nexhire/shared';
import { DataSource, Repository } from 'typeorm';
import { EmailVerification } from '../../entities/email-verification.entity';
import { User } from '../../entities/user.entity';
import { ManualAuthService } from '../manual-auth.service';

type MockRepo = {
  findOne: jest.Mock;
};

function createRepoMock(): MockRepo {
  return {
    findOne: jest.fn(),
  };
}

describe('ManualAuthService', () => {
  let service: ManualAuthService;
  let dataSource: { transaction: jest.Mock };
  let configService: { get: jest.Mock };
  let userRepo: MockRepo;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'authService.verification.tokenLength': 6,
          'authService.verification.tokenTtlMinutes': 15,
        };
        return values[key] ?? fallback;
      }),
    };
    userRepo = createRepoMock();

    service = new ManualAuthService(
      dataSource as unknown as DataSource,
      configService as unknown as ConfigService,
      userRepo as unknown as Repository<User>,
    );
  });

  it('creates a manual email verification token without sending email', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'candidate@nexhire.vn',
      fullName: 'Nguyen Van A',
    } as User);
    jest
      .spyOn(service as never, 'generateVerificationToken' as never)
      .mockReturnValue('654321' as never);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    jest
      .spyOn(service as never, 'buildVerificationExpiry' as never)
      .mockReturnValue(expiresAt as never);
    const manager = {
      create: jest.fn((_: unknown, entity: unknown) => entity),
      save: jest.fn(async (_entity: unknown, payload: Record<string, unknown>) => ({
        id: 'verification-manual-1',
        ...payload,
      })),
      update: jest.fn(),
    };
    dataSource.transaction.mockImplementation(
      async (callback: (entityManager: typeof manager) => Promise<unknown>) => callback(manager),
    );

    try {
      const result = await service.createEmailVerification({
        email: 'candidate@nexhire.vn',
      });

      expect(manager.save).toHaveBeenCalledWith(
        EmailVerification,
        expect.objectContaining({
          userId: 'user-1',
          email: 'candidate@nexhire.vn',
          tokenHash: expect.any(String),
          expiresAt,
          verifiedAt: null,
          resendCount: 0,
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          verificationId: 'verification-manual-1',
          email: 'candidate@nexhire.vn',
          token: '654321',
          expiresAt,
        }),
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('blocks manual email verification in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      await expect(
        service.createEmailVerification({
          email: 'candidate@nexhire.vn',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: ERROR_CODES.COMMON.FORBIDDEN,
        }),
      });
      await expect(
        service.createEmailVerification({
          email: 'candidate@nexhire.vn',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(userRepo.findOne).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
