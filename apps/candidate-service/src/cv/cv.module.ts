import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationClientModule } from '../application-client/application-client.module';
import { CandidateModule } from '../candidate/candidate.module';
import { CandidateCv } from '../candidate/entities/candidate-cv.entity';
import { DocumentClientModule } from '../document-client/document-client.module';
import { CvController } from './cv.controller';
import { CvDocumentCleanupScheduler } from './cv-document-cleanup.scheduler';
import { CvService } from './cv.service';
import { CvEventPublisher } from './events/cv-event.publisher';

@Module({
  imports: [
    TypeOrmModule.forFeature([CandidateCv]),
    CandidateModule,
    ApplicationClientModule,
    DocumentClientModule,
  ],
  controllers: [CvController],
  providers: [CvService, CvDocumentCleanupScheduler, CvEventPublisher],
  exports: [CvService],
})
export class CvModule {}
