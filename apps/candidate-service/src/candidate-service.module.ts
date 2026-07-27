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
  RedisModule,
} from '@nexhire/infra';
import { InternalAuthGuard, RolesGuard } from '@nexhire/shared';
import { CandidateModule } from './candidate/candidate.module';
import { CvModule } from './cv/cv.module';
import { CvTemplateModule } from './cv-template/cv-template.module';
import { FollowedCompanyModule } from './followed-company/followed-company.module';
import { SavedJobModule } from './saved-job/saved-job.module';
import { candidateServiceConfig } from './config/candidate-service.config';
import { validationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        databaseConfigFor('CANDIDATE_SERVICE'),
        redisConfig,
        rabbitmqConfig,
        candidateServiceConfig,
      ],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: buildTypeOrmOptions() }),
    RedisModule.forRoot(),
    HttpModule,
    HealthModule,
    EventBusModule,
    CandidateModule,
    CvModule,
    CvTemplateModule,
    FollowedCompanyModule,
    SavedJobModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: InternalAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class CandidateServiceModule {}
