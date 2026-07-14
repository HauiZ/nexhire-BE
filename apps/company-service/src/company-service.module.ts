import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions, databaseConfigFor, redisConfig } from '@nexhire/infra';
import { InternalAuthGuard, RolesGuard } from '@nexhire/shared';
import { CompanyModule } from './company/company.module';
import { HrAccountModule } from './hr-account/hr-account.module';
import { companyServiceConfig } from './config/company-service.config';
import { validationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfigFor('COMPANY_SERVICE'), redisConfig, companyServiceConfig],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: buildTypeOrmOptions() }),
    HealthModule,
    CompanyModule,
    HrAccountModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: InternalAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class CompanyServiceModule {}
