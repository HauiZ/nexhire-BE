import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

/**
 * BullMQ wiring over Redis. Use once per service that produces/consumes jobs:
 *   QueueModule.forRoot()                       // connection (once)
 *   BullModule.registerQueue({ name: QUEUES.X }) // per queue (from @nestjs/bullmq)
 * Requires `redisConfig` to be loaded in the service's ConfigModule.
 */
@Module({})
export class QueueModule {
  static forRoot(): DynamicModule {
    return {
      module: QueueModule,
      imports: [
        BullModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            connection: {
              host: config.get<string>('redis.host'),
              port: config.get<number>('redis.port'),
            },
          }),
        }),
      ],
      exports: [BullModule],
    };
  }
}
