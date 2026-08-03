import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthUser, ERROR_CODES, paginated, UserRole } from '@nexhire/shared';
import { Brackets, In, Repository } from 'typeorm';
import { TokenService } from '../token/token.service';
import { UserStatus } from '../auth/entities/auth.enum';
import { RecruiterCompanyLink } from '../auth/entities/recruiter-company-link.entity';
import { User } from '../auth/entities/user.entity';
import { AdminUserActionDto, AdminUserRestoreDto } from './dto/admin-user-action.dto';
import {
  AdminGrowthBucket,
  AdminUserGrowthDto,
  AdminUserGrowthPointDto,
  AdminUserGrowthQueryDto,
} from './dto/admin-user-growth.dto';
import { AdminUserOverviewDto } from './dto/admin-user-overview.dto';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import { AdminUserEventPublisher } from './events/admin-user-event.publisher';

interface AdminGrowthRange {
  from: Date;
  to: Date;
  toExclusive: Date;
  bucket: AdminGrowthBucket;
}

@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RecruiterCompanyLink)
    private readonly recruiterCompanyLinkRepo: Repository<RecruiterCompanyLink>,
    private readonly tokenService: TokenService,
    private readonly adminUserEventPublisher: AdminUserEventPublisher,
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
                WHERE link.user_id = "user"."id"
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

  async getGrowth(query: AdminUserGrowthQueryDto): Promise<AdminUserGrowthDto> {
    const range = this.normalizeGrowthRange(query);
    const points = this.createUserGrowthPoints(range);
    const pointByBucket = new Map(points.map((point) => [point.bucket, point]));

    const [registeredRows, bannedRows, suspendedRows, archivedRows] = await Promise.all([
      this.userRepo
        .createQueryBuilder('user')
        .innerJoin('user.userRoles', 'userRole')
        .innerJoin('userRole.role', 'role')
        .select(this.bucketSelect('"user"."created_at"', range), 'bucket')
        .addSelect('role.name', 'role')
        .addSelect('COUNT("user"."id")', 'count')
        .where('"user"."created_at" >= :from', { from: range.from })
        .andWhere('"user"."created_at" < :to', { to: range.toExclusive })
        .groupBy('bucket')
        .addGroupBy('role.name')
        .getRawMany<{ bucket: string; role: UserRole; count: string }>(),
      this.countLifecycleRows('"user"."banned_at"', range),
      this.countLifecycleRows('"user"."suspended_at"', range),
      this.countLifecycleRows('"user"."archived_at"', range),
    ]);

    for (const row of registeredRows) {
      const point = pointByBucket.get(row.bucket);
      if (!point) {
        continue;
      }
      const count = Number(row.count);
      point.registeredUsers += count;
      if (row.role === UserRole.CANDIDATE) {
        point.candidates += count;
      } else if (row.role === UserRole.RECRUITER) {
        point.recruiters += count;
      } else if (row.role === UserRole.ADMIN) {
        point.admins += count;
      }
    }
    this.applyLifecycleRows(pointByBucket, bannedRows, 'bannedUsers');
    this.applyLifecycleRows(pointByBucket, suspendedRows, 'suspendedUsers');
    this.applyLifecycleRows(pointByBucket, archivedRows, 'archivedUsers');

    return {
      from: this.formatDateKey(range.from, range.bucket),
      to: this.formatDateKey(range.to, range.bucket),
      bucket: range.bucket,
      points,
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
    const previousStatus = user.status;
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
    await this.adminUserEventPublisher.publishUserLifecycleChanged({
      userId: saved.id,
      email: saved.email,
      fullName: saved.fullName,
      roles:
        saved.userRoles
          ?.map((userRole) => userRole.role?.name)
          .filter((role): role is UserRole => Boolean(role)) ?? [],
      previousStatus,
      status: saved.status,
      reason: saved.statusReason,
      changedByUserId: admin.id,
      changedAt: saved.statusChangedAt?.toISOString() ?? now.toISOString(),
    });
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

  private async countLifecycleRows(
    column: string,
    range: AdminGrowthRange,
  ): Promise<Array<{ bucket: string; count: string }>> {
    return this.userRepo
      .createQueryBuilder('user')
      .select(this.bucketSelect(column, range), 'bucket')
      .addSelect('COUNT("user"."id")', 'count')
      .where(`${column} >= :from`, { from: range.from })
      .andWhere(`${column} < :to`, { to: range.toExclusive })
      .groupBy('bucket')
      .getRawMany<{ bucket: string; count: string }>();
  }

  private applyLifecycleRows(
    pointByBucket: Map<string, AdminUserGrowthPointDto>,
    rows: Array<{ bucket: string; count: string }>,
    field: 'bannedUsers' | 'suspendedUsers' | 'archivedUsers',
  ): void {
    for (const row of rows) {
      const point = pointByBucket.get(row.bucket);
      if (point) {
        point[field] = Number(row.count);
      }
    }
  }

  private createUserGrowthPoints(range: AdminGrowthRange): AdminUserGrowthPointDto[] {
    return this.createBucketKeys(range).map((bucket) => ({
      bucket,
      registeredUsers: 0,
      candidates: 0,
      recruiters: 0,
      admins: 0,
      bannedUsers: 0,
      suspendedUsers: 0,
      archivedUsers: 0,
    }));
  }

  private normalizeGrowthRange(query: AdminUserGrowthQueryDto): AdminGrowthRange {
    const bucket = query.bucket ?? AdminGrowthBucket.DAY;
    const now = new Date();
    const defaultTo = this.startOfUtcDay(now);
    const defaultFrom = new Date(defaultTo);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

    const from = query.from ? this.parseDateBoundary(query.from) : defaultFrom;
    const to = query.to ? this.parseDateBoundary(query.to) : defaultTo;
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException({
        code: ERROR_CODES.COMMON.VALIDATION_FAILED,
        message: 'from must be before or equal to to',
      });
    }

    return {
      from,
      to,
      toExclusive: this.addBucket(to, bucket),
      bucket,
    };
  }

  private parseDateBoundary(value: string): Date {
    const parsed = new Date(value);
    return this.startOfUtcDay(parsed);
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private addBucket(date: Date, bucket: AdminGrowthBucket): Date {
    const next = new Date(date);
    if (bucket === AdminGrowthBucket.MONTH) {
      next.setUTCMonth(next.getUTCMonth() + 1);
    } else {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  private createBucketKeys(range: AdminGrowthRange): string[] {
    const keys: string[] = [];
    const cursor =
      range.bucket === AdminGrowthBucket.MONTH
        ? new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1))
        : new Date(range.from);
    const end =
      range.bucket === AdminGrowthBucket.MONTH
        ? new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), 1))
        : range.to;

    while (cursor.getTime() <= end.getTime()) {
      keys.push(this.formatDateKey(cursor, range.bucket));
      if (range.bucket === AdminGrowthBucket.MONTH) {
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      } else {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    return keys;
  }

  private bucketSelect(column: string, range: AdminGrowthRange): string {
    const unit = range.bucket === AdminGrowthBucket.MONTH ? 'month' : 'day';
    const format = range.bucket === AdminGrowthBucket.MONTH ? 'YYYY-MM' : 'YYYY-MM-DD';
    return `to_char(date_trunc('${unit}', ${column}), '${format}')`;
  }

  private formatDateKey(date: Date, bucket: AdminGrowthBucket): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    if (bucket === AdminGrowthBucket.MONTH) {
      return `${year}-${month}`;
    }
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
