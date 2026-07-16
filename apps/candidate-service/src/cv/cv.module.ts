import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationClientModule } from '../application-client/application-client.module';
import { CandidateModule } from '../candidate/candidate.module';
import { CandidateCv } from '../candidate/entities/candidate-cv.entity';
import { CvParsingClientModule } from '../cv-parsing-client/cv-parsing-client.module';
import { DocumentClientModule } from '../document-client/document-client.module';
import { CvController } from './cv.controller';
import { CvDocumentCleanupScheduler } from './cv-document-cleanup.scheduler';
import { CvService } from './cv.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CandidateCv]),
    CandidateModule,
    ApplicationClientModule,
    CvParsingClientModule,
    DocumentClientModule,
  ],
  controllers: [CvController],
  providers: [CvService, CvDocumentCleanupScheduler],
  exports: [CvService],
})
export class CvModule {}
