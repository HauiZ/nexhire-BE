import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions, databaseConfigFor, redisConfig } from '@nexhire/infra';
import { InternalAuthGuard, RolesGuard } from '@nexhire/shared';
import { AuthModule } from './auth/auth.module';
import { PermissionModule } from './permission/permission.module';
import { TokenModule } from './token/token.module';
import { authServiceConfig } from './config/auth-service.config';
import { validationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [databaseConfigFor('AUTH_SERVICE'), redisConfig, authServiceConfig], validationSchema }),
    TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: buildTypeOrmOptions() }),
    HealthModule,
    AuthModule,
    TokenModule,
    PermissionModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: InternalAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthServiceModule {}
