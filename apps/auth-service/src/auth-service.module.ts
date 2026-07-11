import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  buildTypeOrmOptions,
  databaseConfigFor,
  EventBusModule,
  rabbitmqConfig,
  redisConfig,
  RedisModule,
} from '@nexhire/infra';
import { InternalAuthGuard, RolesGuard } from '@nexhire/shared';
import { AuthModule } from './auth/auth.module';
import { PermissionModule } from './permission/permission.module';
import { authServiceConfig } from './config/auth-service.config';
import { validationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfigFor('AUTH_SERVICE'), redisConfig, rabbitmqConfig, authServiceConfig],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: buildTypeOrmOptions() }),
    RedisModule.forRoot(),
    EventBusModule,
    HealthModule,
    AuthModule,
    PermissionModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: InternalAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthServiceModule {}
