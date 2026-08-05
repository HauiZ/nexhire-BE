import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CvTemplatePresetController } from './cv-template-preset.controller';
import { CvTemplatePresetService } from './cv-template-preset.service';
import { CvTemplatePreset } from './entities/cv-template-preset.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CvTemplatePreset])],
  controllers: [CvTemplatePresetController],
  providers: [CvTemplatePresetService],
})
export class CvTemplatePresetModule {}
