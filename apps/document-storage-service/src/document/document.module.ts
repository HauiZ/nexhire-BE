import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '@nexhire/infra';
import { DocumentController, DocumentInternalController } from './document.controller';
import { Document } from './entities/document.entity';
import { DocumentService } from './document.service';

@Module({
  imports: [StorageModule, TypeOrmModule.forFeature([Document])],
  controllers: [DocumentController, DocumentInternalController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
