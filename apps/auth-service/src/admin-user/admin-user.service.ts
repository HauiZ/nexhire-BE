import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthUser, ERROR_CODES, paginated, UserRole } from '@nexhire/shared';
import { Brackets, In, Repository } from 'typeorm';
import { TokenService } from '../token/token.service';
import { UserStatus } from '../auth/entities/auth.enum';
import { RecruiterCompanyLink } from '../auth/entities/recruiter-company-link.entity';
import { User } from '../auth/entities/user.entity';
import { AdminUserActionDto, AdminUserRestoreDto } from './dto/admin-user-action.dto';
import { AdminUserOverviewDto } from './dto/admin-user-overview.dto';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';

@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RecruiterCompanyLink)
    private readonly recruiterCompanyLinkRepo: Repository<RecruiterCompanyLink>,
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
            .orWhere('LOWER(user.phone) LIKE :search', { search: `%${search}%` })
            .orWhere(
              `EXISTS (
                SELECT 1 FROM recruiter_company_links link
                WHERE link.user_id = user.id
                AND LOWER(link.company_name) LIKE :search
              )`,
              { search: `%${search}%` },
            );
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
    const companyLinks = await this.getCompanyLinksForUsers(users);
    return paginated(
      users.map((user) => this.toResponse(user, companyLinks.get(user.id) ?? null)),
      total,
      query.page,
      query.limit,
    );
  }

  async get(id: string): Promise<AdminUserResponseDto> {
    const user = await this.findUser(id);
    const companyLink = await this.recruiterCompanyLinkRepo.findOne({ where: { userId: user.id } });
    return this.toResponse(user, companyLink);
  }

  async getOverview(): Promise<AdminUserOverviewDto> {
    const [total, statusRows, roleRows, emailVerified] = await Promise.all([
      this.userRepo.count(),
      this.userRepo
        .createQueryBuilder('user')
        .select('user.status', 'status')
        .addSelect('COUNT(user.id)', 'count')
        .groupBy('user.status')
        .getRawMany<{ status: UserStatus; count: string }>(),
      this.userRepo
        .createQueryBuilder('user')
        .innerJoin('user.userRoles', 'userRole')
        .innerJoin('userRole.role', 'role')
        .select('role.name', 'role')
        .addSelect('COUNT(user.id)', 'count')
        .groupBy('role.name')
        .getRawMany<{ role: UserRole; count: string }>(),
      this.userRepo.count({ where: { emailVerified: true } }),
    ]);

    return {
      total,
      byStatus: this.userStatusCounts(statusRows),
      byRole: this.userRoleCounts(roleRows),
      emailVerified,
      emailUnverified: total - emailVerified,
    };
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
    const companyLink = await this.recruiterCompanyLinkRepo.findOne({
      where: { userId: saved.id },
    });
    return this.toResponse(saved, companyLink);
  }

  private async getCompanyLinksForUsers(users: User[]): Promise<Map<string, RecruiterCompanyLink>> {
    if (users.length === 0) {
      return new Map();
    }
    const links = await this.recruiterCompanyLinkRepo.find({
      where: { userId: In(users.map((user) => user.id)) },
    });
    return new Map(links.map((link) => [link.userId, link]));
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

  private userStatusCounts(
    rows: Array<{ status: UserStatus; count: string }>,
  ): Record<UserStatus, number> {
    const counts = {
      [UserStatus.ACTIVE]: 0,
      [UserStatus.INACTIVE]: 0,
      [UserStatus.SUSPENDED]: 0,
      [UserStatus.LOCKED]: 0,
      [UserStatus.BANNED]: 0,
      [UserStatus.ARCHIVED]: 0,
    };
    for (const row of rows) {
      counts[row.status] = Number(row.count);
    }
    return counts;
  }

  private userRoleCounts(rows: Array<{ role: UserRole; count: string }>): Record<UserRole, number> {
    const counts = {
      [UserRole.CANDIDATE]: 0,
      [UserRole.RECRUITER]: 0,
      [UserRole.ADMIN]: 0,
    };
    for (const row of rows) {
      counts[row.role] = Number(row.count);
    }
    return counts;
  }

  private toResponse(
    user: User,
    companyLink: RecruiterCompanyLink | null = null,
  ): AdminUserResponseDto {
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
      company: companyLink
        ? {
            companyId: companyLink.companyId,
            companyName: companyLink.companyName,
            companyStatus: companyLink.companyStatus,
          }
        : null,
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
