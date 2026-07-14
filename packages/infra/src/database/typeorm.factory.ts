import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { NexHireNamingStrategy } from './naming.strategy';

/**
 * Builds TypeORM module options for a service. Each service connects to its
 * OWN database (DB-per-service) — no shared instance, no schema sharing.
 * Entities are auto-loaded via forFeature(); migrations live in the app's
 * data-source.ts. `synchronize` is always false.
 */
export function buildTypeOrmOptions() {
  return (config: ConfigService): TypeOrmModuleOptions => ({
    type: 'postgres',
    uuidExtension: 'pgcrypto',
    host: config.get<string>('db.host'),
    port: config.get<number>('db.port'),
    username: config.get<string>('db.user'),
    password: config.get<string>('db.pass'),
    database: config.get<string>('db.name'),
    autoLoadEntities: true,
    namingStrategy: new NexHireNamingStrategy(),
    synchronize: false,
    logging: config.get<string>('NODE_ENV') === 'development' ? ['error', 'warn'] : ['error'],
  });
}

/**
 * Raw DataSource options for the TypeORM CLI (migrations). Reads the service's
 * own DB credentials via its env prefix (e.g. 'AUTH' -> AUTH_DB_*).
 */
export function buildDataSourceOptions(rootDir: string, prefix: string) {
  return {
    type: 'postgres' as const,
    uuidExtension: 'pgcrypto' as const,
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env[`${prefix}_DB_USER`],
    password: process.env[`${prefix}_DB_PASS`],
    database: process.env[`${prefix}_DB_NAME`],
    entities: [`${rootDir}/src/**/*.entity.ts`],
    migrations: [`${rootDir}/src/migrations/*.ts`],
    namingStrategy: new NexHireNamingStrategy(),
    synchronize: false,
  };
}
