import { HttpModule } from '@nestjs/axios';
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
import { CvParsingModule } from './cv-parsing/cv-parsing.module';
import { cvParsingServiceConfig } from './config/cv-parsing-service.config';
import { validationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        databaseConfigFor('CV_PARSING_SERVICE'),
        redisConfig,
        rabbitmqConfig,
        cvParsingServiceConfig,
      ],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: buildTypeOrmOptions() }),
    HttpModule,
    EventBusModule,
    HealthModule,
    CvParsingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: InternalAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class CvParsingServiceModule {}
