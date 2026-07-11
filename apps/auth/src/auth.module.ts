import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  buildTypeOrmOptions,
  databaseConfig,
  InternalAuthGuard,
  redisConfig,
  RolesGuard,
} from '@nexhire/shared';
import { authConfig } from './config/auth.config';
import { validationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { CompanyModule } from './company/company.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, authConfig],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions('auth_schema'),
    }),
    HealthModule,
    // feature modules (user / auth / profile / company) are added here as they are built
  ],
  providers: [
    { provide: APP_GUARD, useClass: InternalAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
