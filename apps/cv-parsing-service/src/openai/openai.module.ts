import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AiManagementModule } from '../ai-management/ai-management.module';
import { OpenAiResumeParserClient } from './openai-resume-parser.client';

@Module({
  imports: [HttpModule, AiManagementModule],
  providers: [OpenAiResumeParserClient],
  exports: [OpenAiResumeParserClient],
})
export class OpenAiModule {}
