import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiManagementModule } from '../ai-management/ai-management.module';
import { GeminiModule } from '../gemini/gemini.module';
import { AdminTemplateDesignController } from './admin-template-design.controller';
import { CanvasSanitizerService } from './canvas-sanitizer.service';
import { TemplateDesignDocumentClient } from './document-client/document-client.service';
import { CvTemplateDesignJob } from './entities/cv-template-design-job.entity';
import { OpenAiTemplateDesignClient } from './openai-template-design.client';
import { PdfCanvasLayoutExtractorService } from './pdf-canvas-layout-extractor.service';
import { TemplateDesignService } from './template-design.service';

/**
 * Luồng admin dựng CV template preset từ PDF bằng AI.
 *
 * Cắm cứng OpenAI (không đọc ACTIVE_AI_PROVIDER): CanvasElement là union 4 nhánh,
 * mà chỉ json_schema strict của OpenAI mới diễn đạt được anyOf. Có tiền lệ —
 * ManualCvParsingService cắm cứng Gemini theo cách tương tự.
 *
 * GeminiModule được import chỉ để lấy GeminiResumeNormalizerService; service đó
 * không phụ thuộc provider dù tên có chữ Gemini.
 */
@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([CvTemplateDesignJob]),
    AiManagementModule,
    GeminiModule,
  ],
  controllers: [AdminTemplateDesignController],
  providers: [
    TemplateDesignService,
    OpenAiTemplateDesignClient,
    PdfCanvasLayoutExtractorService,
    TemplateDesignDocumentClient,
    CanvasSanitizerService,
  ],
})
export class TemplateDesignModule {}
