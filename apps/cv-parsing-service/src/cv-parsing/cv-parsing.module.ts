import { Module } from '@nestjs/common';
import { CvParsingController } from './cv-parsing.controller';
import { CvParsingService } from './cv-parsing.service';

@Module({
  controllers: [CvParsingController],
  providers: [CvParsingService],
  exports: [CvParsingService],
})
export class CvParsingModule {}
