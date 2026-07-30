import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CvParsingInternalController } from './cv-parsing.controller';
import { CvParsingService } from './cv-parsing.service';
import { CvParseRequest } from './entities/cv-parse-request.entity';
import { CvParseResult } from './entities/cv-parse-result.entity';
import { CvUploadedEventsConsumer } from './events/consumers/cv-uploaded-events.consumer';
import { CvParseEventPublisher } from './events/cv-parse-event.publisher';
import { ManualCvParsingController } from './manual/manual-cv-parsing.controller';
import { ManualCvParsingService } from './manual/manual-cv-parsing.service';
import { GeminiModule } from '../gemini/gemini.module';
import { SkimaModule } from '../skima/skima.module';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([CvParseRequest, CvParseResult]),
    GeminiModule,
    SkimaModule,
  ],
  controllers: [CvParsingInternalController, ManualCvParsingController],
  providers: [
    CvParsingService,
    ManualCvParsingService,
    CvParseEventPublisher,
    CvUploadedEventsConsumer,
  ],
  exports: [CvParsingService],
})
export class CvParsingModule {}
