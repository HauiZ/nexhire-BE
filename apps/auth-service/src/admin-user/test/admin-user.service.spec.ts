import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ERROR_CODES, UserRole } from '@nexhire/shared';
import { Repository } from 'typeorm';
import { TokenService } from '../../token/token.service';
import { UserStatus } from '../../auth/entities/auth.enum';
import { RecruiterCompanyLink } from '../../auth/entities/recruiter-company-link.entity';
import { Role } from '../../auth/entities/role.entity';
import { UserRoleEntity } from '../../auth/entities/user-role.entity';
import { User } from '../../auth/entities/user.entity';
import { AdminUserService } from '../admin-user.service';

type MockRepo = {
  createQueryBuilder: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
};

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'candidate@nexhire.vn',
    phone: '0901234567',
    fullName: 'Candidate One',
    avatarUrl: null,
    status: UserStatus.ACTIVE,
    emailVerified: true,
    lastLoginAt: null,
    statusReason: null,
    statusChangedBy: null,
    statusChangedAt: null,
    suspendedAt: null,
    bannedAt: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    userRoles: [
      {
        role: { name: UserRole.CANDIDATE } as Role,
      } as UserRoleEntity,
    ],
    ...overrides,
  } as User;
}

describe('AdminUserService', () => {
  let service: AdminUserService;
  let userRepo: MockRepo;
  let recruiterCompanyLinkRepo: { find: jest.Mock; findOne: jest.Mock };
  let tokenService: { revokeAllUserRefreshTokens: jest.Mock };

  beforeEach(() => {
    userRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((user: User) => Promise.resolve(user)),
    };
    recruiterCompanyLinkRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    tokenService = {
      revokeAllUserRefreshTokens: jest.fn(),
    };

    service = new AdminUserService(
      userRepo as unknown as Repository<User>,
      recruiterCompanyLinkRepo as unknown as Repository<RecruiterCompanyLink>,
      tokenService as unknown as TokenService,
    );
  });

  it('lists users with filters and pagination', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[makeUser({ id: 'user-1' })], 1]),
    };
    userRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.list({
      page: 2,
      limit: 10,
      search: 'candidate',
      role: UserRole.CANDIDATE,
      status: UserStatus.ACTIVE,
      skip: 10,
    });

    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(qb.andWhere).toHaveBeenCalledWith('user.status = :status', {
      status: UserStatus.ACTIVE,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('role.name = :role', {
      role: UserRole.CANDIDATE,
    });
    expect(result.meta).toEqual({ page: 2, limit: 10, total: 1 });
    expect(result.data[0]).toMatchObject({
      id: 'user-1',
      roles: [UserRole.CANDIDATE],
      company: null,
    });
  });

  it('returns company snapshot for recruiter users', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          makeUser({
            id: 'recruiter-1',
            email: 'recruiter@nexhire.vn',
            userRoles: [{ role: { name: UserRole.RECRUITER } as Role } as UserRoleEntity],
          }),
        ],
        1,
      ]),
    };
    userRepo.createQueryBuilder.mockReturnValue(qb);
    recruiterCompanyLinkRepo.find.mockResolvedValue([
      {
        userId: 'recruiter-1',
        companyId: 'company-1',
        companyName: 'NexHire Tech',
        companyStatus: 'APPROVED',
      } as RecruiterCompanyLink,
    ]);

    const result = await service.list({
      page: 1,
      limit: 10,
      skip: 0,
    });

    expect(recruiterCompanyLinkRepo.find).toHaveBeenCalledWith({
      where: { userId: expect.any(Object) },
    });
    expect(result.data[0]).toMatchObject({
      id: 'recruiter-1',
      company: {
        companyId: 'company-1',
        companyName: 'NexHire Tech',
        companyStatus: 'APPROVED',
      },
    });
  });

  it('bans user and revokes refresh tokens', async () => {
    const user = makeUser();
    userRepo.findOne.mockResolvedValue(user);

    const result = await service.ban({ id: 'admin-1', role: UserRole.ADMIN }, 'user-1', {
      reason: 'Policy violation',
    });

    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: UserStatus.BANNED,
        statusReason: 'Policy violation',
        statusChangedBy: 'admin-1',
        bannedAt: expect.any(Date),
      }),
    );
    expect(tokenService.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-1');
    expect(result.status).toBe(UserStatus.BANNED);
  });

  it('archives user as soft delete', async () => {
    const user = makeUser();
    userRepo.findOne.mockResolvedValue(user);

    const result = await service.archive({ id: 'admin-1', role: UserRole.ADMIN }, 'user-1', {
      reason: 'Test cleanup',
    });

    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: UserStatus.ARCHIVED,
        archivedAt: expect.any(Date),
      }),
    );
    expect(result.status).toBe(UserStatus.ARCHIVED);
  });

  it('restores user to active and clears lifecycle timestamps', async () => {
    const user = makeUser({
      status: UserStatus.BANNED,
      bannedAt: new Date(),
      suspendedAt: new Date(),
      archivedAt: new Date(),
    });
    userRepo.findOne.mockResolvedValue(user);

    const result = await service.restore({ id: 'admin-1', role: UserRole.ADMIN }, 'user-1', {});

    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: UserStatus.ACTIVE,
        bannedAt: null,
        suspendedAt: null,
        archivedAt: null,
      }),
    );
    expect(result.status).toBe(UserStatus.ACTIVE);
  });

  it('rejects self status management', async () => {
    await expect(
      service.suspend({ id: 'admin-1', role: UserRole.ADMIN }, 'admin-1', { reason: 'self lock' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ERROR_CODES.AUTH.CANNOT_MANAGE_SELF,
      }),
    });
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects missing user', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await expect(service.get('missing-user')).rejects.toBeInstanceOf(NotFoundException);
  });
});
