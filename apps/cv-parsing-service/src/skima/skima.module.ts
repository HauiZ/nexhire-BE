import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { ResumeNormalizerService } from './resume-normalizer.service';
import { SkimaResumeParserClient } from './skima-resume-parser.client';

@Module({
  imports: [HttpModule],
  providers: [ResumeNormalizerService, SkimaResumeParserClient],
  exports: [ResumeNormalizerService, SkimaResumeParserClient],
})
export class SkimaModule {}
