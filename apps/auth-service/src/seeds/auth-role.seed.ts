import { UserRole } from '@nexhire/shared';
import { DataSource } from 'typeorm';

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
