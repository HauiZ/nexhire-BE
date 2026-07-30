import * as bcrypt from 'bcrypt';
import { UserRole } from '@nexhire/shared';
import { DataSource } from 'typeorm';
import authDataSource from '../../data-source';
import { PasswordAlgorithm, UserStatus } from '../auth/entities/auth.enum';
import { Role } from '../auth/entities/role.entity';
import { UserCredential } from '../auth/entities/user-credential.entity';
import { UserRoleEntity } from '../auth/entities/user-role.entity';
import { User } from '../auth/entities/user.entity';
import { seedAuthRoles } from './auth-role.seed';

const ADMIN_EMAIL = 'nexhire.team.support@gmail.com';
const ADMIN_PASSWORD = 'SuperAdmin123@';
const ADMIN_FULL_NAME = 'NexHire Team Support';
const BCRYPT_ROUNDS = 10;

export async function seedAdminAccount(dataSource: DataSource): Promise<void> {
  await seedAuthRoles(dataSource);

  const roleRepo = dataSource.getRepository(Role);

  const adminRole = await roleRepo.findOne({ where: { name: UserRole.ADMIN } });
  if (!adminRole) {
    throw new Error('ADMIN role is missing after role seed');
  }

  const email = ADMIN_EMAIL.toLowerCase();
  const now = new Date();
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);

  await dataSource.transaction(async (manager) => {
    const users = manager.getRepository(User);
    const credentials = manager.getRepository(UserCredential);
    const userRoles = manager.getRepository(UserRoleEntity);

    let user = await users.findOne({ where: { email } });
    user = await users.save(
      users.create({
        id: user?.id,
        email,
        fullName: user?.fullName ?? ADMIN_FULL_NAME,
        phone: user?.phone ?? null,
        avatarUrl: user?.avatarUrl ?? null,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        lastLoginAt: user?.lastLoginAt ?? null,
        statusReason: null,
        statusChangedBy: null,
        statusChangedAt: null,
        suspendedAt: null,
        bannedAt: null,
        archivedAt: null,
      }),
    );

    const existingCredential = await credentials.findOne({ where: { userId: user.id } });
    await credentials.save(
      credentials.create({
        id: existingCredential?.id,
        userId: user.id,
        passwordHash,
        passwordAlgorithm: PasswordAlgorithm.BCRYPT,
        passwordUpdatedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
      }),
    );

    const existingUserRole = await userRoles.findOne({ where: { userId: user.id } });
    await userRoles.save(
      userRoles.create({
        id: existingUserRole?.id,
        userId: user.id,
        roleId: adminRole.id,
      }),
    );
  });
}

export async function seed(): Promise<void> {
  await authDataSource.initialize();
  try {
    await seedAdminAccount(authDataSource);
    console.log(`admin account seeded: ${ADMIN_EMAIL}`);
  } finally {
    await authDataSource.destroy();
  }
}

export default seed;
