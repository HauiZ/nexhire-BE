import { UserRole } from '@nexhire/shared';
import { DataSource } from 'typeorm';
import authDataSource from '../../data-source';

const DEFAULT_ROLES = [
  { name: UserRole.CANDIDATE, description: 'Candidate account' },
  { name: UserRole.RECRUITER, description: 'Company recruiter account' },
  { name: UserRole.ADMIN, description: 'System administrator account' },
];

export async function seedAuthRoles(dataSource: DataSource): Promise<void> {
  for (const role of DEFAULT_ROLES) {
    await dataSource.query(
      `
        INSERT INTO "roles" ("name", "description")
        VALUES ($1, $2)
        ON CONFLICT ("name") DO UPDATE
        SET "description" = EXCLUDED."description"
      `,
      [role.name, role.description],
    );
  }
}

export async function seed(): Promise<void> {
  await authDataSource.initialize();
  try {
    await seedAuthRoles(authDataSource);
    console.log('auth roles seeded');
  } finally {
    await authDataSource.destroy();
  }
}

export default seed;
