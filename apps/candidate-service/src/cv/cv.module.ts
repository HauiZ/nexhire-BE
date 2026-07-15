import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidateModule } from '../candidate/candidate.module';
import { CandidateCv } from '../candidate/entities/candidate-cv.entity';
import { DocumentClientModule } from '../document-client/document-client.module';
import { CvController } from './cv.controller';
import { CvService } from './cv.service';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([CandidateCv]),
    CandidateModule,
    DocumentClientModule,
  ],
  controllers: [CvController],
  providers: [CvService],
  exports: [CvService],
})
export class CvModule {}
