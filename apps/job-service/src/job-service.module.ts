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
} from '@nexhire/infra';
import { InternalAuthGuard, RolesGuard } from '@nexhire/shared';
import { CategoryModule } from './category/category.module';
import { JobModule } from './job/job.module';
import { jobServiceConfig } from './config/job-service.config';
import { validationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfigFor('JOB_SERVICE'), redisConfig, rabbitmqConfig, jobServiceConfig],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: buildTypeOrmOptions() }),
    EventBusModule,
    HealthModule,
    JobModule,
    CategoryModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: InternalAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class JobServiceModule {}
