import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Builds TypeORM module options for a service. Entities are auto-loaded via
 * forFeature(); migrations are handled by each app's data-source.ts (CLI).
 * `synchronize` is always false — schema changes go through migrations only.
 */
export function buildTypeOrmOptions(schema: string) {
  return (config: ConfigService): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: config.get<string>('db.host'),
    port: config.get<number>('db.port'),
    username: config.get<string>('db.user'),
    password: config.get<string>('db.pass'),
    database: config.get<string>('db.name'),
    schema,
    autoLoadEntities: true,
    synchronize: false,
    logging: config.get<string>('NODE_ENV') === 'development' ? ['error', 'warn'] : ['error'],
  });
}

/** Raw DataSource options for the TypeORM CLI (migrations). */
export function buildDataSourceOptions(schema: string, rootDir: string) {
  return {
    type: 'postgres' as const,
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? 'postgres',
    database: process.env.DB_NAME ?? 'nexhire',
    schema,
    entities: [`${rootDir}/src/**/*.entity.ts`],
    migrations: [`${rootDir}/src/migrations/*.ts`],
    synchronize: false,
  };
}
