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
    ssl: (process.env.DB_SSL ?? 'false') === 'true',
    sslRejectUnauthorized: (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? 'false') === 'true',
    poolMax: parseInt(process.env.DB_POOL_MAX ?? '3', 10),
    poolIdleTimeoutMs: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? '10000', 10),
    poolConnectionTimeoutMs: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS ?? '5000', 10),
  }));

/** Shared Redis config (cache, rate limit, token store). */
export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL,
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
}));

/** RabbitMQ config (async event bus). */
export const rabbitmqConfig = registerAs('rabbitmq', () => ({
  url: process.env.RABBITMQ_URL ?? 'amqp://nexhire:nexhire@localhost:5672',
  exchange: process.env.RABBITMQ_EXCHANGE ?? 'nexhire.events',
}));

/** S3-compatible object-storage config. Falls back to local MinIO env names. */
export const storageConfig = registerAs('storage', () => ({
  endpoint:
    process.env.STORAGE_ENDPOINT ??
    `${process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'}://${process.env.MINIO_ENDPOINT ?? 'localhost'}:${process.env.MINIO_PORT ?? '9000'}`,
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  accessKey: process.env.STORAGE_ACCESS_KEY ?? process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
  secretKey: process.env.STORAGE_SECRET_KEY ?? process.env.MINIO_SECRET_KEY ?? 'minioadmin',
  bucket: process.env.STORAGE_BUCKET_NAME ?? process.env.MINIO_BUCKET ?? 'nexhire',
  forcePathStyle: (process.env.STORAGE_FORCE_PATH_STYLE ?? 'true') === 'true',
}));
