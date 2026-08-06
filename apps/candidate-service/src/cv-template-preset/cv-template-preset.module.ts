import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminCvTemplatePresetController } from './admin-cv-template-preset.controller';
import { CvTemplatePresetController } from './cv-template-preset.controller';
import { CvTemplatePresetService } from './cv-template-preset.service';
import { CvTemplatePreset } from './entities/cv-template-preset.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CvTemplatePreset])],
  controllers: [CvTemplatePresetController, AdminCvTemplatePresetController],
  providers: [CvTemplatePresetService],
})
export class CvTemplatePresetModule {}
