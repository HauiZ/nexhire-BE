import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/** DI token for the shared ioredis client. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Provides a single configured ioredis client (cache, token store, locks).
 * Import once per service that needs Redis: `RedisModule.forRoot()`.
 * Requires `redisConfig` to be loaded in the service's ConfigModule.
 */
@Global()
@Module({})
export class RedisModule {
  static forRoot(): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        {
          provide: REDIS_CLIENT,
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const url = config.get<string>('redis.url');

            if (url) {
              return new Redis(url, {
                maxRetriesPerRequest: null,
              });
            }

            return new Redis({
              host: config.get<string>('redis.host'),
              port: config.get<number>('redis.port'),
              maxRetriesPerRequest: null,
            });
          },
        },
      ],
      exports: [REDIS_CLIENT],
    };
  }
}
