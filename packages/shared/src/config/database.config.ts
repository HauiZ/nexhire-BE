import { registerAs } from '@nestjs/config';

/** Shared DB connection config (single Postgres instance, schema set per service). */
export const databaseConfig = registerAs('db', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  user: process.env.DB_USER ?? 'postgres',
  pass: process.env.DB_PASS ?? 'postgres',
  name: process.env.DB_NAME ?? 'nexhire',
}));

/** Shared Redis config (BullMQ + token store). */
export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
}));
