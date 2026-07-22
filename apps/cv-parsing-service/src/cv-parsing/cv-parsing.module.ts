import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CvParsingController, CvParsingInternalController } from './cv-parsing.controller';
import { CvParsingService } from './cv-parsing.service';
import { CvParseRequest } from './entities/cv-parse-request.entity';
import { CvParseResult } from './entities/cv-parse-result.entity';
import { ManualCvParsingController } from './manual/manual-cv-parsing.controller';
import { ManualCvParsingService } from './manual/manual-cv-parsing.service';
import { CandidateClientModule } from '../candidate-client/candidate-client.module';
import { GeminiModule } from '../gemini/gemini.module';
import { SkimaModule } from '../skima/skima.module';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([CvParseRequest, CvParseResult]),
    CandidateClientModule,
    GeminiModule,
    SkimaModule,
  ],
  controllers: [CvParsingController, CvParsingInternalController, ManualCvParsingController],
  providers: [CvParsingService, ManualCvParsingService],
  exports: [CvParsingService],
})
export class CvParsingModule {}
