import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CandidateModule } from '../candidate/candidate.module';
import { CandidateCv } from '../candidate/entities/candidate-cv.entity';
import { CvParsingClientModule } from '../cv-parsing-client/cv-parsing-client.module';
import { DocumentClientModule } from '../document-client/document-client.module';
import { CandidateCvTemplate } from './entities/cv-template.entity';
import { CvTemplateController } from './cv-template.controller';
import { CvTemplateService } from './cv-template.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CandidateCvTemplate, CandidateCv]),
    CandidateModule,
    CvParsingClientModule,
    DocumentClientModule,
  ],
  controllers: [CvTemplateController],
  providers: [CvTemplateService],
})
export class CvTemplateModule {}
