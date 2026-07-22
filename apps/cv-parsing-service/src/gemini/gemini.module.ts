import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini.client';
import { GeminiResumeNormalizerService } from './gemini-resume-normalizer.service';
import { GeminiResumeParserClient } from './gemini-resume-parser.client';

@Module({
  imports: [HttpModule],
  providers: [GeminiClient, GeminiResumeNormalizerService, GeminiResumeParserClient],
  exports: [GeminiClient, GeminiResumeParserClient],
})
export class GeminiModule {}
