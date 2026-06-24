import { registerAs } from '@nestjs/config';

/**
 * Per-service database config (DB-per-service). Each service owns its own
 * database + user; pass the service's env prefix (e.g. 'AUTH' -> AUTH_DB_*).
 * Registered under the fixed 'db' namespace so the TypeORM factory is generic.
 */
export const databaseConfigFor = (prefix: string) =>
  registerAs('db', () => ({
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: process.env[`${prefix}_DB_NAME`],
    user: process.env[`${prefix}_DB_USER`],
    pass: process.env[`${prefix}_DB_PASS`],
  }));

/** Shared Redis config (cache, rate limit, token store). */
export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
}));

/** RabbitMQ config (async event bus). */
export const rabbitmqConfig = registerAs('rabbitmq', () => ({
  url: process.env.RABBITMQ_URL ?? 'amqp://nexhire:nexhire@localhost:5672',
  exchange: process.env.RABBITMQ_EXCHANGE ?? 'nexhire.events',
}));

/** MinIO / object-storage config. */
export const storageConfig = registerAs('storage', () => ({
  endpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
  useSsl: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
  bucket: process.env.MINIO_BUCKET ?? 'nexhire',
}));
