import { HttpModule } from '@nestjs/axios';
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
import { aiConfig } from './config/ai.config';
import { validationSchema } from './config/env.validation';
import { GeminiModule } from './gemini/gemini.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, aiConfig],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions('ai_schema'),
    }),
    HttpModule,
    GeminiModule,
    HealthModule,
    // feature modules (parse / evaluate / match) are added here as they are built
  ],
  providers: [
    { provide: APP_GUARD, useClass: InternalAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AiModule {}
