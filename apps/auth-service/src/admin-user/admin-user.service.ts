import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthUser, ERROR_CODES, paginated, UserRole } from '@nexhire/shared';
import { Brackets, Repository } from 'typeorm';
import { TokenService } from '../token/token.service';
import { UserStatus } from '../auth/entities/auth.enum';
import { User } from '../auth/entities/user.entity';
import { AdminUserActionDto, AdminUserRestoreDto } from './dto/admin-user-action.dto';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';

@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly tokenService: TokenService,
  ) {}

  async list(query: AdminUserQueryDto) {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userRoles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role')
      .orderBy('user.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const search = query.search?.trim().toLowerCase();
    if (search) {
      qb.andWhere(
        new Brackets((builder) => {
          builder
            .where('LOWER(user.email) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(user.fullName) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(user.phone) LIKE :search', { search: `%${search}%` });
        }),
      );
    }

    if (query.status) {
      qb.andWhere('user.status = :status', { status: query.status });
    }

    if (query.role) {
      qb.andWhere('role.name = :role', { role: query.role });
    }

    const [users, total] = await qb.getManyAndCount();
    return paginated(
      users.map((user) => this.toResponse(user)),
      total,
      query.page,
      query.limit,
    );
  }

  async get(id: string): Promise<AdminUserResponseDto> {
    return this.toResponse(await this.findUser(id));
  }

  async suspend(
    admin: AuthUser,
    id: string,
    dto: AdminUserActionDto,
  ): Promise<AdminUserResponseDto> {
    return this.changeStatus(admin, id, UserStatus.SUSPENDED, dto.reason);
  }

  async ban(admin: AuthUser, id: string, dto: AdminUserActionDto): Promise<AdminUserResponseDto> {
    return this.changeStatus(admin, id, UserStatus.BANNED, dto.reason);
  }

  async archive(
    admin: AuthUser,
    id: string,
    dto: AdminUserActionDto,
  ): Promise<AdminUserResponseDto> {
    return this.changeStatus(admin, id, UserStatus.ARCHIVED, dto.reason);
  }

  async restore(
    admin: AuthUser,
    id: string,
    dto: AdminUserRestoreDto,
  ): Promise<AdminUserResponseDto> {
    return this.changeStatus(admin, id, UserStatus.ACTIVE, dto.reason ?? 'Restored by admin');
  }

  private async changeStatus(
    admin: AuthUser,
    id: string,
    status: UserStatus,
    reason: string,
  ): Promise<AdminUserResponseDto> {
    if (admin.id === id) {
      throw new ForbiddenException({
        code: ERROR_CODES.AUTH.CANNOT_MANAGE_SELF,
        message: 'Admin cannot manage their own account status',
      });
    }

    const user = await this.findUser(id);
    const now = new Date();
    user.status = status;
    user.statusReason = reason.trim();
    user.statusChangedBy = admin.id;
    user.statusChangedAt = now;

    if (status === UserStatus.SUSPENDED) {
      user.suspendedAt = now;
    } else if (status === UserStatus.BANNED) {
      user.bannedAt = now;
    } else if (status === UserStatus.ARCHIVED) {
      user.archivedAt = now;
    } else if (status === UserStatus.ACTIVE) {
      user.suspendedAt = null;
      user.bannedAt = null;
      user.archivedAt = null;
    }

    const saved = await this.userRepo.save(user);
    await this.tokenService.revokeAllUserRefreshTokens(user.id);
    this.logger.log(`Admin changed user status userId=${id} status=${status} adminId=${admin.id}`);
    return this.toResponse(saved);
  }

  private async findUser(id: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: { userRoles: { role: true } },
    });
    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.AUTH.USER_NOT_FOUND,
        message: 'User not found',
      });
    }
    return user;
  }

  private toResponse(user: User): AdminUserResponseDto {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      roles:
        user.userRoles
          ?.map((userRole) => userRole.role?.name)
          .filter((role): role is UserRole => Boolean(role)) ?? [],
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt,
      statusReason: user.statusReason,
      statusChangedBy: user.statusChangedBy,
      statusChangedAt: user.statusChangedAt,
      suspendedAt: user.suspendedAt,
      bannedAt: user.bannedAt,
      archivedAt: user.archivedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
