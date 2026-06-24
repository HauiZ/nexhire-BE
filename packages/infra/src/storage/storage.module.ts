import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Object-storage (MinIO) module. Import where file storage is needed.
 * Requires `storageConfig` to be loaded in the service's ConfigModule.
 */
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
