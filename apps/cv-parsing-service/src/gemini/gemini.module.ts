import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AiManagementModule } from '../ai-management/ai-management.module';
import { GeminiClient } from './gemini.client';
import { GeminiResumeNormalizerService } from './gemini-resume-normalizer.service';
import { GeminiResumeParserClient } from './gemini-resume-parser.client';

@Module({
  imports: [HttpModule, AiManagementModule],
  providers: [GeminiClient, GeminiResumeNormalizerService, GeminiResumeParserClient],
  exports: [GeminiClient, GeminiResumeParserClient],
})
export class GeminiModule {}
