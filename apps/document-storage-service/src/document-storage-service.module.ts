import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions, databaseConfigFor, redisConfig, storageConfig } from '@nexhire/infra';
import { InternalAuthGuard, RolesGuard } from '@nexhire/shared';
import { documentStorageServiceConfig } from './config/document-storage-service.config';
import { validationSchema } from './config/env.validation';
import { DocumentModule } from './document/document.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        databaseConfigFor('DOCUMENT_STORAGE_SERVICE'),
        redisConfig,
        storageConfig,
        documentStorageServiceConfig,
      ],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions(),
    }),
    HealthModule,
    DocumentModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: InternalAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class DocumentStorageServiceModule {}
